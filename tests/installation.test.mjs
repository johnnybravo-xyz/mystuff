import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const repository = new URL('../', import.meta.url);

async function installation(t) {
  const directory = await mkdtemp(join(tmpdir(), 'mystuff-installation-'));
  const data = join(directory, 'data');
  await mkdir(data);
  const modules = [
    ['db/initial-schema.ts', 'initial-schema'],
    ['db/shop-migration.ts', 'shop-migration'],
    ['db/group-migration.ts', 'group-migration'],
    ['db/platform-migration.ts', 'platform-migration'],
    ['db/index.ts', 'db'],
    ['app/wardrobe/model.ts', 'model'],
    ['app/installation.ts', 'installation'],
  ];
  for (const [source, name] of modules) {
    let code = await readFile(new URL(source, repository), 'utf8');
    for (const [specifier, replacement] of [
      ['argon2', import.meta.resolve('argon2')],
      ['@/db', './db.mjs'],
      ['./wardrobe/model', './model.mjs'],
      ['./initial-schema', './initial-schema.mjs'],
      ['./shop-migration', './shop-migration.mjs'],
      ['./group-migration', './group-migration.mjs'],
      ['./platform-migration', './platform-migration.mjs'],
    ]) code = code.replaceAll(`'${specifier}'`, `'${replacement}'`);
    await writeFile(
      join(directory, `${name}.mjs`),
      stripTypeScriptTypes(code, { mode: 'transform' }),
    );
  }
  const previous = process.env.ARCHIVE_DATA_DIR;
  process.env.ARCHIVE_DATA_DIR = data;
  t.after(async () => {
    if (previous === undefined) delete process.env.ARCHIVE_DATA_DIR;
    else process.env.ARCHIVE_DATA_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const app = await import(pathToFileURL(join(directory, 'installation.mjs')).href);
  const database = await import(pathToFileURL(join(directory, 'db.mjs')).href);
  return { ...app, testDb: database.getDb };
}

test('fresh setup creates one administrator, stable profiles, settings and database sessions', async (t) => {
  const app = await installation(t);
  const before = await app.getInstallation();
  assert.equal(before.setupComplete, false);
  assert.equal(before.settings.features.shop, false);
  assert.ok(before.settings.enabledCollections.includes('pets'));

  const token = await app.ensureSetupClaim();
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  await assert.rejects(
    app.completeSetup('wrong-token', {}),
    /invalid or has expired/,
  );
  await app.completeSetup(token, {
    displayName: 'Alex',
    password: 'correct horse battery staple',
    title: 'Alex’s Things',
    subtitle: 'Collected with care.',
    locale: 'en-AU',
    timeZone: 'Australia/Sydney',
    baseCurrency: 'AUD',
    profiles: ['Me', 'Partner', 'Pets'],
    enabledCollections: ['home', 'tech', 'pantry', 'pets'],
    features: { wishlist: true, outfits: false, shop: false },
    demoData: true,
  });

  const after = await app.getInstallation();
  assert.equal(
    app.testDb().connection.prepare("SELECT count(*) AS count FROM wardrobe_items WHERE source_key LIKE 'demo:%'").get().count,
    3,
  );
  assert.equal(after.setupComplete, true);
  assert.equal(after.settings.baseCurrency, 'AUD');
  assert.deepEqual(after.profiles.map((profile) => profile.label), [
    'Me',
    'Partner',
    'Pets',
  ]);
  assert.equal(new Set(after.profiles.map((profile) => profile.id)).size, 3);
  const firstProfileId = after.profiles[0].id;
  const updated = await app.updateInstallation({
    settings: {
      ...after.settings,
      title: 'Our Things',
      enabledCollections: [...after.settings.enabledCollections, 'fashion'],
    },
    profiles: [
      { id: firstProfileId, label: 'Alex' },
      { id: after.profiles[1].id, label: 'Partner' },
      { id: after.profiles[2].id, label: 'Pets' },
      { label: 'Studio' },
    ],
  });
  assert.equal(updated.settings.title, 'Our Things');
  assert.equal(updated.profiles[0].id, firstProfileId);
  assert.equal(updated.profiles[0].label, 'Alex');
  assert.equal(updated.profiles.length, 4);
  await assert.rejects(
    app.updateInstallation({
      settings: {
        ...updated.settings,
        features: { ...updated.settings.features, shop: true },
      },
      profiles: updated.profiles,
      shopExposureConfirmed: true,
    }),
    /MYSTUFF_PUBLIC_URL/,
  );
  assert.equal(await app.ensureSetupClaim(), null);
  await assert.rejects(app.completeSetup(token, {}), /already complete/);
  assert.equal(await app.authenticateAdministrator('wrong password'), null);

  const user = await app.authenticateAdministrator('correct horse battery staple');
  assert.equal(user.display_name, 'Alex');
  const session = app.createDatabaseSession(user);
  assert.equal(app.databaseSession(session).display_name, 'Alex');
  app.deleteDatabaseSession(session);
  assert.equal(app.databaseSession(session), null);
});

test('login throttling persists attempts in SQLite', async (t) => {
  const app = await installation(t);
  for (let attempt = 0; attempt < 10; attempt += 1)
    assert.equal(app.persistentLoginAttempt(1_000), 0);
  assert.equal(app.persistentLoginAttempt(1_000), 900);
  app.clearPersistentLoginAttempts();
  assert.equal(app.persistentLoginAttempt(1_000), 0);
});
