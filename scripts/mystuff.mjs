#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, createReadStream } from 'node:fs';
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { argon2id, hash } from 'argon2';

const FORMAT = 'mystuff-backup';
const FORMAT_VERSION = 1;
// Must match dataDirectory() in db/index.ts. The container sets
// ARCHIVE_DATA_DIR=/data; a source checkout uses ./data.
const DATA_DIR = resolve(process.env.ARCHIVE_DATA_DIR || 'data');
const DATABASE = join(DATA_DIR, 'archive.sqlite');
const SETUP_TOKEN = join(DATA_DIR, 'secrets', 'setup.token');

function usage() {
  console.log(`My Stuff maintenance CLI

Usage:
  mystuff setup-token [--rotate]
  mystuff password reset [--password-stdin]
  mystuff backup <file>
  mystuff export <file>
  mystuff restore --verify <file>
  mystuff restore [--replace] <file>
  mystuff images audit`);
}

function fail(message) {
  throw new Error(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function filesUnder(root, prefix = '') {
  if (!(await exists(root))) return [];
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const archivePath = join(prefix, entry.name).split(sep).join('/');
    if (entry.isDirectory())
      output.push(...(await filesUnder(path, archivePath)));
    else if (entry.isFile()) output.push({ path, archivePath });
  }
  return output.sort((a, b) => a.archivePath.localeCompare(b.archivePath));
}

function openDatabase(path = DATABASE, options = {}) {
  if (!options.allowMissing && !existsSync(path))
    fail(`Database not found at ${path}.`);
  return new DatabaseSync(path, options);
}

async function manifestFor(stage, schemaVersion, kind) {
  const files = [];
  for (const entry of await filesUnder(stage)) {
    if (entry.archivePath === 'manifest.json') continue;
    const details = await stat(entry.path);
    files.push({
      path: entry.archivePath,
      bytes: details.size,
      sha256: await sha256(entry.path),
    });
  }
  return {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    kind,
    createdAt: new Date().toISOString(),
    schemaVersion,
    files,
  };
}

function runTar(args, cwd) {
  const result = spawnSync('tar', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0)
    fail(`Archive command failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

async function createArchive(targetValue, kind = 'backup') {
  const target = resolve(targetValue);
  if (await exists(target)) fail(`Refusing to overwrite ${target}.`);
  await mkdir(dirname(target), { recursive: true });
  const work = await mkdtemp(join(tmpdir(), 'mystuff-backup-'));
  const stage = join(work, 'payload');
  await mkdir(stage);
  const db = openDatabase();
  let schemaVersion;
  try {
    schemaVersion = db.prepare('PRAGMA user_version').get().user_version;
    await sqliteBackup(db, join(stage, 'archive.sqlite'));
  } finally {
    db.close();
  }
  if (await exists(join(DATA_DIR, 'images')))
    await cp(join(DATA_DIR, 'images'), join(stage, 'images'), {
      recursive: true,
    });
  const manifest = await manifestFor(stage, schemaVersion, kind);
  await writeFile(
    join(stage, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    runTar(['-czf', temporary, '.'], stage);
    await rename(temporary, target);
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(temporary, { force: true });
  }
  console.log(
    `${kind === 'export' ? 'Export' : 'Backup'} written to ${target}`,
  );
}

function safeArchiveEntries(file) {
  const entries = runTar(['-tzf', file], undefined)
    .split('\n')
    .map((entry) => entry.replace(/^\.\//, ''))
    .filter(Boolean);
  for (const entry of entries) {
    if (entry.startsWith('/') || entry.split('/').includes('..'))
      fail('Archive contains an unsafe path.');
  }
}

async function extractAndVerify(fileValue) {
  const file = resolve(fileValue);
  if (!(await exists(file))) fail(`Archive not found at ${file}.`);
  safeArchiveEntries(file);
  const work = await mkdtemp(join(tmpdir(), 'mystuff-restore-'));
  try {
    runTar(['-xzf', file, '-C', work], undefined);
    const manifestPath = join(work, 'manifest.json');
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch {
      await rm(work, { recursive: true, force: true });
      fail('Archive manifest is missing or invalid.');
    }
    if (manifest.format !== FORMAT || manifest.formatVersion !== FORMAT_VERSION)
      fail('Archive format is not supported by this version of My Stuff.');
    if (
      !Array.isArray(manifest.files) ||
      !Number.isInteger(manifest.schemaVersion)
    )
      fail('Archive manifest is incomplete.');
    for (const expected of manifest.files) {
      if (
        !expected ||
        typeof expected.path !== 'string' ||
        expected.path.startsWith('/') ||
        expected.path.split('/').includes('..') ||
        typeof expected.sha256 !== 'string'
      )
        fail('Archive manifest contains an invalid file entry.');
      const path = resolve(work, expected.path);
      if (!path.startsWith(work + sep))
        fail('Archive file path escaped its root.');
      const details = await stat(path).catch(() => null);
      if (
        !details?.isFile() ||
        details.size !== expected.bytes ||
        (await sha256(path)) !== expected.sha256
      )
        fail(`Archive checksum failed for ${expected.path}.`);
    }
    const db = new DatabaseSync(join(work, 'archive.sqlite'), {
      readOnly: true,
    });
    try {
      const integrity = db
        .prepare('PRAGMA integrity_check')
        .get().integrity_check;
      const version = db.prepare('PRAGMA user_version').get().user_version;
      if (integrity !== 'ok')
        fail(`SQLite integrity check failed: ${integrity}`);
      if (version !== manifest.schemaVersion)
        fail('Database schema version does not match the manifest.');
    } finally {
      db.close();
    }
    return { work, manifest };
  } catch (error) {
    await rm(work, { recursive: true, force: true });
    throw error;
  }
}

async function verifyArchive(file) {
  const { work, manifest } = await extractAndVerify(file);
  await rm(work, { recursive: true, force: true });
  console.log(
    `Verified ${manifest.files.length} files at schema ${manifest.schemaVersion}.`,
  );
}

async function restoreArchive(file, replace) {
  const verified = await extractAndVerify(file);
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const managed = [
      'archive.sqlite',
      'archive.sqlite-wal',
      'archive.sqlite-shm',
      'images',
    ];
    const occupied = [];
    for (const name of managed)
      if (await exists(join(DATA_DIR, name))) occupied.push(name);
    if (occupied.length && !replace)
      fail(
        `Target ${DATA_DIR} is not empty (${occupied.join(', ')}). Use --replace explicitly.`,
      );
    for (const name of managed)
      await rm(join(DATA_DIR, name), { recursive: true, force: true });
    await cp(
      join(verified.work, 'archive.sqlite'),
      join(DATA_DIR, 'archive.sqlite'),
    );
    if (await exists(join(verified.work, 'images')))
      await cp(join(verified.work, 'images'), join(DATA_DIR, 'images'), {
        recursive: true,
      });
    else await mkdir(join(DATA_DIR, 'images'));
    console.log(
      `Restored schema ${verified.manifest.schemaVersion} into ${DATA_DIR}. Restart My Stuff now.`,
    );
  } finally {
    await rm(verified.work, { recursive: true, force: true });
  }
}

function pendingSetup(db) {
  const installation = db
    .prepare(
      "SELECT setup_complete,setup_token_digest FROM installations WHERE id='main'",
    )
    .get();
  if (!installation)
    fail(
      'Installation record is missing. Start My Stuff once before printing the setup link.',
    );
  if (installation.setup_complete === 1)
    fail('Setup is already complete and cannot be reopened.');
  return installation;
}

function printSetupLink(token) {
  console.log(`One-time setup token: ${token}`);
  console.log(`Open /setup?token=${token} on this installation.`);
}

// Must match ensureSetupClaim in app/installation.ts: the server accepts the
// token in secrets/setup.token only while its digest matches the database.
async function showSetupToken() {
  const db = openDatabase(DATABASE, { readOnly: true });
  try {
    const installation = pendingSetup(db);
    const token = (await readFile(SETUP_TOKEN, 'utf8').catch(() => '')).trim();
    const digest = createHash('sha256').update(token).digest('hex');
    if (!token || digest !== installation.setup_token_digest)
      fail(
        'No current setup token. Run `mystuff setup-token --rotate` to create one.',
      );
    printSetupLink(token);
  } finally {
    db.close();
  }
}

async function rotateSetupToken() {
  const db = openDatabase();
  try {
    pendingSetup(db);
    const token = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(token).digest('hex');
    const now = new Date().toISOString();
    await mkdir(dirname(SETUP_TOKEN), { recursive: true });
    await writeFile(SETUP_TOKEN, token, { mode: 0o600 });
    await chmod(SETUP_TOKEN, 0o600);
    db.prepare(
      "UPDATE installations SET setup_token_digest=?,setup_token_created_at=?,updated_at=? WHERE id='main'",
    ).run(digest, now, now);
    printSetupLink(token);
  } finally {
    db.close();
  }
}

async function readPassword(fromStdin) {
  if (fromStdin) {
    const chunks = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8').trimEnd();
  }
  if (!stdin.isTTY)
    fail('Use --password-stdin when standard input is not a terminal.');
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const first = await prompt.question('New administrator password: ');
    const second = await prompt.question('Repeat password: ');
    if (first !== second) fail('Passwords do not match.');
    return first;
  } finally {
    prompt.close();
  }
}

async function resetPassword(fromStdin) {
  const password = await readPassword(fromStdin);
  if (password.length < 12 || password.length > 1024)
    fail('Use a password between 12 and 1,024 characters.');
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const db = openDatabase();
  try {
    db.exec('BEGIN IMMEDIATE');
    const result = db
      .prepare(
        "UPDATE users SET password_hash=?,updated_at=? WHERE installation_id='main'",
      )
      .run(passwordHash, new Date().toISOString());
    if (result.changes !== 1)
      fail('Administrator user is missing. Complete setup first.');
    db.prepare("DELETE FROM sessions WHERE account_id='owner'").run();
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    db.close();
  }
  console.log(
    'Administrator password reset. Existing sessions were signed out.',
  );
}

async function auditImages() {
  const db = openDatabase();
  let rows;
  try {
    rows = db
      .prepare('SELECT object_key FROM images ORDER BY object_key')
      .all()
      .map((row) => row.object_key);
  } finally {
    db.close();
  }
  const files = (await filesUnder(join(DATA_DIR, 'images'))).map(
    (entry) => entry.archivePath,
  );
  const rowSet = new Set(rows);
  const fileSet = new Set(files);
  const missingFiles = rows.filter((key) => !fileSet.has(key));
  const unreferencedFiles = files.filter((key) => !rowSet.has(key));
  console.log(
    JSON.stringify(
      {
        rows: rows.length,
        files: files.length,
        missingFiles,
        unreferencedFiles,
      },
      null,
      2,
    ),
  );
  if (missingFiles.length || unreferencedFiles.length) process.exitCode = 2;
}

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  if (command === 'setup-token' && subcommand === '--rotate')
    return rotateSetupToken();
  if (command === 'setup-token' && !subcommand) return showSetupToken();
  if (command === 'password' && subcommand === 'reset')
    return resetPassword(rest.includes('--password-stdin'));
  if (
    (command === 'backup' || command === 'export') &&
    subcommand &&
    !rest.length
  )
    return createArchive(
      subcommand,
      command === 'export' ? 'export' : 'backup',
    );
  if (command === 'restore' && subcommand === '--verify' && rest.length === 1)
    return verifyArchive(rest[0]);
  if (command === 'restore') {
    const replace = [subcommand, ...rest].includes('--replace');
    const files = [subcommand, ...rest].filter(
      (value) => value && value !== '--replace',
    );
    if (files.length === 1) return restoreArchive(files[0], replace);
  }
  if (command === 'images' && subcommand === 'audit' && !rest.length)
    return auditImages();
  usage();
  process.exitCode = command ? 1 : 0;
}

main().catch((error) => {
  console.error(
    `mystuff: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
