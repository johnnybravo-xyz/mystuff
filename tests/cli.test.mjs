import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { verify } from 'argon2';

const cli = resolve('scripts/mystuff.mjs');

function run(data, args, input) {
  return spawnSync(process.execPath, [cli, ...args], {
    env: { ...process.env, ARCHIVE_DATA_DIR: data },
    input,
    encoding: 'utf8',
  });
}

function fixture(path) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA user_version=4;
    CREATE TABLE installations (
      id TEXT PRIMARY KEY,
      setup_complete INTEGER NOT NULL,
      setup_token_digest TEXT,
      setup_token_created_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      installation_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE sessions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL);
    CREATE TABLE images (object_key TEXT NOT NULL);
    INSERT INTO installations VALUES ('main',0,NULL,NULL,'2026-01-01T00:00:00Z');
    INSERT INTO users VALUES ('admin','main','owner','old','2026-01-01T00:00:00Z');
    INSERT INTO sessions VALUES ('session','owner');
    INSERT INTO images VALUES ('owner/photo.png');
  `);
  db.close();
}

test('maintenance CLI rotates setup, backs up, verifies, restores and audits data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mystuff-cli-test-'));
  const source = join(root, 'source');
  const target = join(root, 'target');
  const archive = join(root, 'backup.tar.gz');
  await mkdir(join(source, 'images', 'owner'), { recursive: true });
  await writeFile(join(source, 'images', 'owner', 'photo.png'), 'photo bytes');
  fixture(join(source, 'archive.sqlite'));

  const rotated = run(source, ['setup-token', '--rotate']);
  assert.equal(rotated.status, 0, rotated.stderr);
  const token = /One-time setup token: (\S+)/.exec(rotated.stdout)?.[1];
  assert.ok(token);
  assert.equal((await readFile(join(source, 'secrets', 'setup.token'), 'utf8')).trim(), token);
  const shown = run(source, ['setup-token']);
  assert.equal(shown.status, 0, shown.stderr);
  assert.match(shown.stdout, new RegExp(`setup\\?token=${token}`));
  let db = new DatabaseSync(join(source, 'archive.sqlite'));
  assert.equal(
    db.prepare("SELECT setup_token_digest FROM installations WHERE id='main'").get().setup_token_digest,
    createHash('sha256').update(token).digest('hex'),
  );
  db.prepare("UPDATE installations SET setup_complete=1 WHERE id='main'").run();
  db.close();
  assert.equal(run(source, ['setup-token', '--rotate']).status, 1);
  assert.equal(run(source, ['setup-token']).status, 1);

  const backedUp = run(source, ['backup', archive]);
  assert.equal(backedUp.status, 0, backedUp.stderr);
  assert.equal(run(source, ['restore', '--verify', archive]).status, 0);
  assert.equal(run(target, ['restore', archive]).status, 0);
  assert.equal(await readFile(join(target, 'images', 'owner', 'photo.png'), 'utf8'), 'photo bytes');
  assert.equal(run(target, ['restore', archive]).status, 1);
  assert.equal(run(target, ['restore', '--replace', archive]).status, 0);

  const reset = run(target, ['password', 'reset', '--password-stdin'], 'a-new-safe-password\n');
  assert.equal(reset.status, 0, reset.stderr);
  db = new DatabaseSync(join(target, 'archive.sqlite'));
  const passwordHash = db.prepare("SELECT password_hash FROM users WHERE id='admin'").get().password_hash;
  assert.equal(await verify(passwordHash, 'a-new-safe-password'), true);
  assert.equal(db.prepare('SELECT count(*) AS count FROM sessions').get().count, 0);
  db.close();

  assert.equal(run(target, ['images', 'audit']).status, 0);
  await writeFile(join(target, 'images', 'orphan.png'), 'orphan');
  const audit = run(target, ['images', 'audit']);
  assert.equal(audit.status, 2);
  assert.match(audit.stdout, /orphan\.png/);
});
