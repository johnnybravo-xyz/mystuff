import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const repository = new URL('../', import.meta.url);
const migration = await readFile(
    new URL('drizzle/0000_sour_jackal.sql', repository),
    'utf8',
);

async function application(t, seed) {
    const directory = await mkdtemp(join(tmpdir(), 'fashion-archive-storage-'));
    const data = join(directory, 'data');
    await mkdir(data);
    const databasePath = join(data, 'archive.sqlite');
    if (seed) {
        const database = new DatabaseSync(databasePath);
        try {
            seed(database);
        } finally {
            database.close();
        }
    }
    // Compile the actual server entry point into an isolated module graph and data directory.
    const modules = [
        ['db/initial-schema.ts', 'initial-schema'],
        ['db/shop-migration.ts', 'shop-migration'],
        ['db/group-migration.ts', 'group-migration'],
        ['db/platform-migration.ts', 'platform-migration'],
        ['db/index.ts', 'db'],
        ['app/wardrobe/model.ts', 'model'],
        ['app/wardrobe/item-price.ts', 'item-price'],
        ['app/wardrobe/shop-model.ts', 'shop-model'],
        ['app/auth.ts', 'auth'],
        ['app/wardrobe/server.ts', 'server'],
        ['app/api/archive/route.ts', 'route'],
    ];
    for (const [source, name] of modules) {
        let code = await readFile(new URL(source, repository), 'utf8');
        for (const [specifier, replacement] of [
            ['@/app/wardrobe/server', './server.mjs'],
            ['@/app/auth', './auth.mjs'],
            ['@/db', './db.mjs'],
            ['./model', './model.mjs'],
            ['./item-price', './item-price.mjs'],
            ['./shop-model', './shop-model.mjs'],
            ['./initial-schema', './initial-schema.mjs'],
            ['./shop-migration', './shop-migration.mjs'],
            ['./group-migration', './group-migration.mjs'],
            ['./platform-migration', './platform-migration.mjs'],
            [
                'vinext/shims/navigation-errors',
                import.meta.resolve('vinext/shims/navigation-errors'),
            ],
        ])
            code = code.replaceAll(`'${specifier}'`, `'${replacement}'`);
        await writeFile(
            join(directory, `${name}.mjs`),
            stripTypeScriptTypes(code, { mode: 'transform' }),
        );
    }
    const previous = Object.fromEntries(
        ['ARCHIVE_DATA_DIR', 'NODE_ENV', 'ARCHIVE_LOCAL_PREVIEW'].map((key) => [
            key,
            process.env[key],
        ]),
    );
    process.env.ARCHIVE_DATA_DIR = data;
    process.env.NODE_ENV = 'development';
    process.env.ARCHIVE_LOCAL_PREVIEW = '1';
    let connection;
    t.after(async () => {
        connection?.close();
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
        await rm(directory, { recursive: true, force: true });
    });
    const storage = await import(pathToFileURL(join(directory, 'db.mjs')).href);
    const route = await import(
        pathToFileURL(join(directory, 'route.mjs')).href
    );
    return {
        databasePath,
        route,
        db() {
            connection = storage.getDb().connection;
            return connection;
        },
        async post(body) {
            return route.POST(
                new Request('http://localhost/api/archive', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Origin: 'http://localhost',
                    },
                    body: JSON.stringify(body),
                }),
            );
        },
    };
}

function piece(number) {
    return {
        id: `item${number}`,
        sourceKey: `manual:item${number}`,
        purchaseId: null,
        owner: 'me',
        status: 'owned',
        name: `Item ${number}`,
        brand: 'Test',
        category: 'shirt',
        colour: 'Navy',
        size: 'M',
        quantity: 1,
        fit: '',
        pattern: '',
        warmth: 'light',
        notes: '',
        favourite: false,
        imageId: null,
        productUrl: null,
        updatedAt: '2026-09-08T00:00:00Z',
    };
}
function importItems(count) {
    return {
        action: 'import',
        payload: {
            version: 1,
            label: 'Storage regression fixture',
            source: 'test',
            orderCount: 0,
            listedItemCount: count,
            purchases: [],
            items: Array.from({ length: count }, (_, index) =>
                piece(index + 1),
            ),
        },
    };
}
function versionAt(path) {
    const database = new DatabaseSync(path, { readOnly: true });
    try {
        return database.prepare('PRAGMA user_version').get().user_version;
    } finally {
        database.close();
    }
}

test('an empty data directory starts a usable current archive', async (t) => {
    const app = await application(t);
    const db = app.db();
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
    const response = await app.post(importItems(1));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).archive.items.length, 1);
});

test('an existing Drizzle schema with version zero is adopted without losing records', async (t) => {
    const preferences = JSON.stringify({ favouriteColours: ['Navy'] });
    const app = await application(t, (db) => {
        db.exec(migration);
        db.prepare(
            'INSERT INTO preferences (account_id,data) VALUES (?,?)',
        ).run('owner', preferences);
    });
    const db = app.db();
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
    assert.equal(
        db
            .prepare('SELECT data FROM preferences WHERE account_id=?')
            .get('owner').data,
        preferences,
    );
});

test('an incompatible version-zero schema is rejected without being marked migrated', async (t) => {
    const app = await application(t, (db) =>
        db.exec(
            migration.replace(
                '`content_type` text NOT NULL',
                '`content_type` text',
            ),
        ),
    );
    assert.throws(() => app.db(), /schema is incompatible: table images/);
    assert.equal(versionAt(app.databasePath), 0);
});

test('a newer database version is rejected without changing its version', async (t) => {
    const app = await application(t, (db) => db.exec('PRAGMA user_version=5'));
    assert.throws(
        () => app.db(),
        /version 5 is newer than supported version 4/,
    );
    assert.equal(versionAt(app.databasePath), 5);
});

test('a late import failure rolls back every item and leaves the API write queue usable', async (t) => {
    const app = await application(t);
    const db = app.db();
    db.exec(
        "CREATE TRIGGER reject_item BEFORE INSERT ON wardrobe_items WHEN NEW.id='owner:item90' BEGIN SELECT RAISE(ABORT, 'injected import failure'); END",
    );
    const failed = await app.post(importItems(90));
    assert.equal(failed.status, 500);
    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM wardrobe_items').get().count,
        0,
    );
    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM import_batches').get().count,
        0,
    );
    db.exec('DROP TRIGGER reject_item');
    const succeeded = await app.post(importItems(90));
    assert.equal(succeeded.status, 200);
    assert.equal((await succeeded.json()).archive.items.length, 90);
    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM import_batches').get().count,
        1,
    );
});

test('a late bulk update failure rolls back edits to all selected items', async (t) => {
    const app = await application(t);
    const db = app.db();
    assert.equal((await app.post(importItems(90))).status, 200);
    db.exec(
        "CREATE TRIGGER reject_update BEFORE UPDATE ON wardrobe_items WHEN NEW.id='owner:item9' BEGIN SELECT RAISE(ABORT, 'injected update failure'); END",
    );
    const response = await app.post({
        action: 'update',
        ids: Array.from({ length: 90 }, (_, index) => `item${index + 1}`),
        patch: { notes: 'Changed' },
    });
    assert.equal(response.status, 500);
    const items = db
        .prepare('SELECT data FROM wardrobe_items')
        .all()
        .map((row) => JSON.parse(row.data));
    assert(items.every((item) => item.notes === ''));
});

test('concurrent API edits to different fields both survive', async (t) => {
    const app = await application(t);
    const db = app.db();
    assert.equal((await app.post(importItems(1))).status, 200);
    const responses = await Promise.all([
        app.post({
            action: 'update',
            ids: ['item1'],
            patch: { notes: 'Preserved note' },
        }),
        app.post({
            action: 'update',
            ids: ['item1'],
            patch: { favourite: true },
        }),
    ]);
    assert.deepEqual(
        responses.map((response) => response.status),
        [200, 200],
    );
    const item = JSON.parse(
        db
            .prepare('SELECT data FROM wardrobe_items WHERE id=?')
            .get('owner:item1').data,
    );
    assert.equal(item.notes, 'Preserved note');
    assert.equal(item.favourite, true);
});

function registerPhotos(db, ids) {
    for (const id of ids)
        db.prepare(
            'INSERT INTO images (id,account_id,object_key,content_type) VALUES (?,?,?,?)',
        ).run(`owner:${id}`, 'owner', `owner/${id}`, 'image/png');
}

for (const fixture of [
    {
        name: 'Dining bench',
        category: 'furniture',
        owner: 'household',
        location: 'Dining room',
        detail: { label: 'Material', value: 'Oak' },
    },
    {
        name: 'Baby highchair',
        category: 'baby_gear',
        owner: 'child',
        location: 'Kitchen',
        detail: { label: 'Model', value: 'Convertible highchair' },
    },
]) {
    test(`API add and update retain ${fixture.owner} ${fixture.category} details and photo provenance`, async (t) => {
        const app = await application(t);
        const db = app.db();
        registerPhotos(db, ['reference-front', 'reference-detail']);
        const photo = {
            imageId: 'reference-front',
            kind: 'product',
            alt: fixture.name,
            sourceUrl: 'https://example.com/products/reference-front.png',
            referenceConfirmed: false,
        };
        const added = await app.post({
            action: 'add',
            item: {
                ...fixture,
                detail: undefined,
                details: [fixture.detail],
                photos: [photo],
                imageId: photo.imageId,
            },
        });
        assert.equal(added.status, 200);
        const addedArchive = (await added.json()).archive;
        assert.equal(addedArchive.items.length, 1);
        const item = addedArchive.items[0];
        assert.equal(item.category, fixture.category);
        assert.equal(item.owner, fixture.owner);
        assert.equal(item.location, fixture.location);
        assert.deepEqual(item.details, [fixture.detail]);
        assert.deepEqual(item.photos, [photo]);

        const patch = {
            location: 'Upstairs',
            imageId: 'reference-detail',
            details: [
                fixture.detail,
                { label: 'Care', value: 'Wipe with a soft cloth' },
            ],
            photos: [
                { ...photo, referenceConfirmed: true },
                {
                    imageId: 'reference-detail',
                    kind: 'detail',
                    alt: 'Manufacturer detail',
                    sourceUrl:
                        'https://example.com/products/reference-detail.png',
                    referenceConfirmed: false,
                },
            ],
        };
        const updated = await app.post({
            action: 'update',
            ids: [item.id],
            patch,
        });
        assert.equal(updated.status, 200);
        const updatedItem = (await updated.json()).archive.items.find(
            (record) => record.id === item.id,
        );
        assert.equal(updatedItem.owner, fixture.owner);
        assert.equal(updatedItem.category, fixture.category);
        assert.equal(updatedItem.location, patch.location);
        assert.equal(updatedItem.imageId, 'reference-detail');
        assert.deepEqual(updatedItem.details, patch.details);
        assert.deepEqual(updatedItem.photos, patch.photos);

        assert.equal(
            (
                await app.post({
                    action: 'update',
                    ids: [item.id],
                    patch: { notes: 'Keep this record' },
                })
            ).status,
            200,
        );
        const stored = JSON.parse(
            db
                .prepare('SELECT data FROM wardrobe_items WHERE id=?')
                .get(`owner:${item.id}`).data,
        );
        assert.equal(stored.owner, fixture.owner);
        assert.equal(stored.category, fixture.category);
        assert.equal(stored.location, patch.location);
        assert.equal(stored.imageId, 'reference-detail');
        assert.deepEqual(stored.details, patch.details);
        assert.deepEqual(stored.photos, patch.photos);
    });
}

test('API add and update reject malformed labelled details without storing changes', async (t) => {
    const app = await application(t);
    const db = app.db();
    const item = {
        name: 'Dining table',
        category: 'furniture',
        owner: 'household',
        location: 'Dining room',
        details: [{ label: 'Material', value: 'Wood' }],
    };
    const added = await app.post({ action: 'add', item });
    assert.equal(added.status, 200);
    const id = (await added.json()).archive.items[0].id;
    const before = db
        .prepare('SELECT data FROM wardrobe_items WHERE id=?')
        .get(`owner:${id}`).data;
    for (const details of [
        null,
        'Material: wood',
        { label: 'Material', value: 'Wood' },
        [null],
        [{ label: 42, value: 'Wood' }],
        [{ label: 'Material', value: ['Wood'] }],
    ]) {
        for (const body of [
            { action: 'add', item: { ...item, details } },
            { action: 'update', ids: [id], patch: { details } },
        ]) {
            const response = await app.post(body);
            assert.equal(
                response.status,
                400,
                `${body.action} accepted malformed details: ${JSON.stringify(details)}`,
            );
            assert.match((await response.json()).error, /labelled values/);
        }
    }
    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM wardrobe_items').get().count,
        1,
    );
    assert.equal(
        db
            .prepare('SELECT data FROM wardrobe_items WHERE id=?')
            .get(`owner:${id}`).data,
        before,
    );
});

test('API add and update reject invalid photo reference metadata without storing changes', async (t) => {
    const app = await application(t);
    const db = app.db();
    registerPhotos(db, ['reference-front']);
    const photo = {
        imageId: 'reference-front',
        kind: 'product',
        alt: 'Highchair reference',
        sourceUrl: 'https://example.com/highchair.png',
        referenceConfirmed: false,
    };
    const item = {
        name: 'Highchair',
        category: 'baby_gear',
        owner: 'child',
        photos: [photo],
        imageId: photo.imageId,
    };
    const added = await app.post({ action: 'add', item });
    assert.equal(added.status, 200);
    const id = (await added.json()).archive.items[0].id;
    const before = db
        .prepare('SELECT data FROM wardrobe_items WHERE id=?')
        .get(`owner:${id}`).data;
    for (const metadata of [
        { referenceConfirmed: 'yes' },
        { referenceConfirmed: null },
        { sourceUrl: 42 },
        { sourceUrl: null },
        { sourceUrl: 'http://example.com/highchair.png' },
        { sourceUrl: 'javascript:alert(1)' },
    ]) {
        const photos = [{ ...photo, ...metadata }];
        for (const body of [
            { action: 'add', item: { ...item, photos } },
            { action: 'update', ids: [id], patch: { photos } },
        ]) {
            const response = await app.post(body);
            assert.equal(
                response.status,
                400,
                `${body.action} accepted invalid photo metadata: ${JSON.stringify(metadata)}`,
            );
            assert.match(
                (await response.json()).error,
                /photo gallery is invalid/,
            );
        }
    }
    assert.equal(
        db.prepare('SELECT COUNT(*) AS count FROM wardrobe_items').get().count,
        1,
    );
    assert.equal(
        db
            .prepare('SELECT data FROM wardrobe_items WHERE id=?')
            .get(`owner:${id}`).data,
        before,
    );
});

test('Trash and restore preserve item details and photos, exclude removed items, and survive reimport', async (t) => {
    const app = await application(t);
    const initial = importItems(3);
    initial.payload.items[1].status = 'review';
    initial.payload.items[1].owner = 'unassigned';
    assert.equal((await app.post(initial)).status, 200);
    const db = app.db();
    registerPhotos(db, ['kept-photo']);
    assert.equal(
        (
            await app.post({
                action: 'update',
                ids: ['item1'],
                patch: {
                    notes: 'A personal note',
                    photos: [
                        {
                            imageId: 'kept-photo',
                            kind: 'personal',
                            alt: 'My photo',
                        },
                    ],
                },
            })
        ).status,
        200,
    );
    const removedResponse = await app.post({
        action: 'trash',
        ids: ['item1', 'item2'],
    });
    assert.equal(removedResponse.status, 200);
    const removed = (await removedResponse.json()).archive.items;
    assert.equal(removed.find((i) => i.id === 'item1').status, 'trashed');
    assert.equal(
        removed.find((i) => i.id === 'item1').trash.previousStatus,
        'owned',
    );
    assert.equal(
        removed.find((i) => i.id === 'item2').trash.previousStatus,
        'review',
    );
    const count = db
        .prepare('SELECT COUNT(*) AS count FROM images')
        .get().count;
    assert.equal(count, 1);
    for (const body of [
        { action: 'update', ids: ['item1'], patch: { status: 'owned' } },
        { action: 'update', ids: ['item3'], patch: { status: 'trashed' } },
        {
            action: 'update',
            ids: ['item3'],
            patch: {
                trash: {
                    previousStatus: 'owned',
                    trashedAt: new Date().toISOString(),
                },
            },
        },
        { action: 'trash', ids: ['item1'] },
        { action: 'restore', ids: ['item3'] },
        { action: 'add', item: { name: 'Invalid trash', status: 'trashed' } },
    ])
        assert.equal((await app.post(body)).status, 400, JSON.stringify(body));
    assert.equal((await app.post(initial)).status, 200);
    const stillRemoved = JSON.parse(
        db
            .prepare('SELECT data FROM wardrobe_items WHERE id=?')
            .get('owner:item1').data,
    );
    assert.equal(stillRemoved.status, 'trashed');
    assert.equal(stillRemoved.notes, 'A personal note');
    assert.equal(stillRemoved.photos[0].imageId, 'kept-photo');
    const restoredResponse = await app.post({
        action: 'restore',
        ids: ['item1', 'item2'],
    });
    assert.equal(restoredResponse.status, 200);
    const restored = (await restoredResponse.json()).archive.items;
    assert.equal(restored.find((i) => i.id === 'item1').status, 'owned');
    assert.equal(restored.find((i) => i.id === 'item2').status, 'review');
    assert.equal(restored.find((i) => i.id === 'item1').trash, undefined);
    assert.equal(
        restored.find((i) => i.id === 'item1').notes,
        'A personal note',
    );
    assert.equal(
        restored.find((i) => i.id === 'item1').photos[0].imageId,
        'kept-photo',
    );
});

test('bulk Trash validates the entire selection and restore cannot override returned purchase facts', async (t) => {
    const app = await application(t);
    assert.equal((await app.post(importItems(2))).status, 200);
    const db = app.db();
    const before = db
        .prepare('SELECT data FROM wardrobe_items WHERE id=?')
        .get('owner:item1').data;
    assert.equal(
        (await app.post({ action: 'trash', ids: ['item1', 'missing'] })).status,
        404,
    );
    assert.equal(
        db
            .prepare('SELECT data FROM wardrobe_items WHERE id=?')
            .get('owner:item1').data,
        before,
    );
    for (const ids of [
        [],
        ['bad:id'],
        Array.from({ length: 501 }, () => 'item1'),
    ])
        assert.equal((await app.post({ action: 'trash', ids })).status, 400);
    const item = JSON.parse(before);
    item.purchaseId = 'source0';
    db.prepare('UPDATE wardrobe_items SET purchase_id=?,data=? WHERE id=?').run(
        'source0',
        JSON.stringify(item),
        'owner:item1',
    );
    db.prepare(
        'INSERT INTO purchase_lines (id,account_id,source_key,data) VALUES (?,?,?,?)',
    ).run(
        'owner:source0',
        'owner',
        'source:0',
        JSON.stringify({ id: 'source0', fulfillment: 'delivered' }),
    );
    assert.equal(
        (await app.post({ action: 'trash', ids: ['item1'] })).status,
        200,
    );
    db.prepare('UPDATE purchase_lines SET data=? WHERE id=?').run(
        JSON.stringify({ id: 'source0', fulfillment: 'returned' }),
        'owner:source0',
    );
    const response = await app.post({ action: 'restore', ids: ['item1'] });
    assert.equal(response.status, 200);
    assert.equal(
        (await response.json()).archive.items.find((i) => i.id === 'item1')
            .status,
        'returned',
    );
});

test('integration bearer access is scoped, retries do not duplicate additions, and stale changes conflict', async (t) => {
    const app = await application(t);
    const token = 'storage_only_integration_token_1234567890';
    const previous = process.env.ARCHIVE_AGENT_TOKEN_SHA256;
    process.env.ARCHIVE_AGENT_TOKEN_SHA256 = createHash('sha256')
        .update(token)
        .digest('hex');
    t.after(() => {
        if (previous === undefined)
            delete process.env.ARCHIVE_AGENT_TOKEN_SHA256;
        else process.env.ARCHIVE_AGENT_TOKEN_SHA256 = previous;
    });
    const route = app.route;
    const call = (body, credential = token) =>
        route.POST(
            new Request('https://inventory.example/api/archive', {
                method: 'POST',
                headers: {
                    authorization: 'Bearer ' + credential,
                    'content-type': 'application/json',
                },
                body: JSON.stringify(body),
            }),
        );
    const body = {
        action: 'add',
        requestId: 'discord:message:1',
        item: { name: 'iPhone 15 Pro Max', category: 'phone', owner: 'me' },
    };
    assert.equal((await call(body, 'wrong')).status, 401);
    const first = await call(body);
    assert.equal(first.status, 200);
    const firstItem = (await first.json()).result;
    const repeated = await call(body);
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).result.id, firstItem.id);
    const read = await route.GET(
        new Request('https://inventory.example/api/archive', {
            headers: { authorization: 'Bearer ' + token },
        }),
    );
    assert.equal(read.status, 200);
    assert.equal((await read.json()).items.length, 1);
    assert.equal((await call(importItems(1))).status, 403);
    assert.equal(
        (await call({ action: 'preferences', preferences: {} })).status,
        403,
    );
    const changed = await call({
        action: 'update',
        ids: [firstItem.id],
        patch: { notes: 'Added through integration' },
        expectedUpdatedAt: { [firstItem.id]: firstItem.updatedAt },
    });
    assert.equal(changed.status, 200);
    for (const action of ['update', 'trash', 'restore']) {
        const response = await call({
            action,
            ids: [firstItem.id],
            patch: { notes: 'Stale' },
            expectedUpdatedAt: { [firstItem.id]: '2000-01-01T00:00:00.000Z' },
        });
        assert.equal(response.status, 409);
    }
    const records = await route.GET(
        new Request('https://inventory.example/api/archive', {
            headers: { authorization: 'Bearer ' + token },
        }),
    );
    assert.equal((await records.json()).items[0].notes, 'Added through integration');
});

test('item revisions advance across same-clock writes, restore, reimport and clock rollback', async (t) => {
    const app = await application(t);
    app.db();
    const RealDate = Date;
    let now = RealDate.parse('2026-09-09T03:00:00.000Z');
    globalThis.Date = class extends RealDate {
        constructor(...values) {
            super(...(values.length ? values : [now]));
        }
        static now() {
            return now;
        }
    };
    try {
        const added = await app.post({
            action: 'add',
            item: {
                name: 'Revision fixture',
                updatedAt: '2200-01-01T00:00:00Z',
            },
        });
        assert.equal(added.status, 200);
        let item = (await added.json()).result;
        assert.equal(item.updatedAt, new RealDate(now).toISOString());
        for (const action of ['update', 'trash', 'restore', 'import']) {
            const previous = item.updatedAt;
            if (action === 'restore') now -= 60_000;
            const body =
                action === 'import'
                    ? {
                          ...importItems(1),
                          payload: { ...importItems(1).payload, items: [item] },
                      }
                    : {
                          action,
                          ids: [item.id],
                          patch: { notes: 'Saved once' },
                          expectedUpdatedAt: { [item.id]: previous },
                      };
            const response = await app.post(body);
            assert.equal(response.status, 200, action);
            item = (await response.json()).archive.items[0];
            assert(Date.parse(item.updatedAt) > Date.parse(previous), action);
            const stale = await app.post({
                action: 'update',
                ids: [item.id],
                patch: { notes: 'Stale overwrite' },
                expectedUpdatedAt: { [item.id]: previous },
            });
            assert.equal(stale.status, 409, action);
        }
        assert.equal(item.notes, 'Saved once');
    } finally {
        globalThis.Date = RealDate;
    }
});

test('reimport rejects a merged gallery over the limit without changing items or batches', async (t) => {
    const app = await application(t);
    const db = app.db();
    registerPhotos(
        db,
        Array.from({ length: 31 }, (_, index) => `photo${index}`),
    );
    const initial = importItems(1);
    initial.payload.items[0].photos = Array.from(
        { length: 30 },
        (_, index) => ({
            imageId: `photo${index}`,
            kind: 'detail',
            alt: `Photo ${index}`,
        }),
    );
    assert.equal((await app.post(initial)).status, 200);
    const before = await app.route.GET(
        new Request('http://localhost/api/archive'),
    );
    const archive = await before.json();
    const addition = importItems(1);
    addition.payload.items[0].photos = [
        { imageId: 'photo30', kind: 'detail', alt: 'Extra' },
    ];
    const response = await app.post(addition);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /photo gallery/i);
    const after = await app.route.GET(
        new Request('http://localhost/api/archive'),
    );
    assert.deepEqual(await after.json(), archive);
    assert.equal(
        (
            await app.post({
                action: 'update',
                ids: ['item1'],
                patch: { notes: 'Still editable' },
            })
        ).status,
        200,
    );
});

test('add rejects non-object payloads with validation errors and no records', async (t) => {
    const app = await application(t);
    app.db();
    for (const item of [undefined, null, 'not an object', 1, true, []]) {
        const response = await app.post({ action: 'add', item });
        assert.equal(response.status, 400, JSON.stringify(item));
    }
    const archive = await app.route.GET(
        new Request('http://localhost/api/archive'),
    );
    assert.equal((await archive.json()).items.length, 0);
});

test('add retries retain the original edited or trashed item', async (t) => {
    const app = await application(t);
    app.db();
    const body = {
        action: 'add',
        requestId: 'retry:original:1',
        item: { name: 'Original' },
    };
    const responses = await Promise.all([app.post(body), app.post(body)]);
    assert(responses.every((response) => response.status === 200));
    const [first, repeated] = await Promise.all(
        responses.map((response) => response.json()),
    );
    assert.equal(first.result.id, repeated.result.id);
    const id = first.result.id;
    assert.equal(
        (
            await app.post({
                action: 'update',
                ids: [id],
                patch: { name: 'Corrected', notes: 'Keep this correction' },
            })
        ).status,
        200,
    );
    const retry = await app.post({
        ...body,
        item: { name: 'Different payload' },
    });
    assert.equal((await retry.json()).result.name, 'Corrected');
    assert.equal((await app.post({ action: 'trash', ids: [id] })).status, 200);
    const removedRetry = await app.post(body);
    const result = await removedRetry.json();
    assert.equal(result.result.id, id);
    assert.equal(result.result.status, 'trashed');
    assert.equal(result.result.notes, 'Keep this correction');
    assert.equal(result.archive.items.length, 1);
});

test('purchase and custom photos share one gallery limit during updates and reimports', async (t) => {
    const app = await application(t);
    const db = app.db();
    registerPhotos(
        db,
        Array.from({ length: 31 }, (_, index) => `photo${index}`),
    );
    const photo = (index) => ({
        imageId: `photo${index}`,
        kind: 'detail',
        alt: `Photo ${index}`,
    });
    const purchase = {
        id: 'purchase1',
        sourceKey: 'retailer:order:article',
        retailer: 'Test',
        orderId: 'order1',
        orderDate: '2026-09-09',
        parcel: '1',
        sourceStatus: 'Delivered',
        article: 'article1',
        name: 'Shirt',
        colour: 'Black',
        size: 'M',
        fulfillment: 'delivered',
        quantity: 1,
        price: null,
        paid: null,
        productUrl: null,
        sourceImageUrl: null,
        imageId: null,
        photos: Array.from({ length: 29 }, (_, index) => photo(index)),
    };
    const initial = importItems(0);
    initial.payload.purchases = [purchase];
    assert.equal((await app.post(initial)).status, 200);
    // An override of an existing photo is one photo; the new photo brings the total to 30.
    const accepted = await app.post({
        action: 'update',
        ids: ['purchase1-1'],
        patch: { photos: [{ ...photo(0), kind: 'personal' }, photo(30)] },
    });
    assert.equal(accepted.status, 200);
    const before = (await accepted.json()).archive;
    const update = await app.post({
        action: 'update',
        ids: ['purchase1-1'],
        patch: { photos: [photo(29), photo(30)] },
    });
    assert.equal(update.status, 400);
    assert.match((await update.json()).error, /photo gallery/i);
    // Reconciliation must validate against the new purchase gallery, not its previous 29 photos.
    const reimport = importItems(0);
    reimport.payload.purchases = [{ ...purchase, photos: [photo(29)] }];
    const response = await app.post(reimport);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /photo gallery/i);
    const after = await app.route.GET(
        new Request('http://localhost/api/archive'),
    );
    assert.deepEqual(await after.json(), before);
    assert.equal(
        (
            await app.post({
                action: 'update',
                ids: ['purchase1-1'],
                patch: { notes: 'Still editable' },
            })
        ).status,
        200,
    );
});

test('wishlist and USD prices persist through updates, moves, Trash and explicit price clearing', async (t) => {
    const app = await application(t);
    const price = {
        amount: 125,
        isLowerBound: true,
        currency: 'USD',
        basis: 'estimate',
        checkedAt: '2026-09-09',
        originalAmount: 110,
        originalCurrency: 'EUR',
        exchangeRate: 1.13636,
        exchangeRateDate: '2026-09-09',
        exchangeRateSourceUrl: 'https://example.com/rates',
        sourceUrl: 'https://example.com/item',
        notes: 'Reference only',
    };
    const added = await app.post({
        action: 'add',
        item: {
            name: 'Wishlist camera',
            category: 'camera',
            status: 'wishlist',
            price,
        },
    });
    assert.equal(added.status, 200);
    const item = (await added.json()).result;
    assert.equal(item.status, 'wishlist');
    assert.deepEqual(item.price, price);
    for (const patch of [
        { notes: 'Edited item notes' },
        { status: 'owned' },
        { status: 'wishlist' },
    ]) {
        const response = await app.post({
            action: 'update',
            ids: [item.id],
            patch,
        });
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).result[0].price, price);
    }
    await app.post({ action: 'trash', ids: [item.id] });
    const restored = await app.post({ action: 'restore', ids: [item.id] });
    const restoredItem = (await restored.json()).result[0];
    assert.equal(restoredItem.status, 'wishlist');
    assert.deepEqual(restoredItem.price, price);
    const bad = await app.post({
        action: 'update',
        ids: [item.id],
        patch: { price: { ...price, amount: -1 } },
    });
    assert.equal(bad.status, 400);
    const invalidBound = await app.post({
        action: 'update',
        ids: [item.id],
        patch: { price: { ...price, isLowerBound: 'yes' } },
    });
    assert.equal(invalidBound.status, 400);
    const afterInvalid = await app.route.GET(
        new Request('http://localhost/api/archive'),
    );
    assert.deepEqual(
        (await afterInvalid.json()).items.find((entry) => entry.id === item.id)
            .price,
        price,
    );
    const exact = await app.post({
        action: 'update',
        ids: [item.id],
        patch: { price: { ...price, isLowerBound: false } },
    });
    assert.equal(exact.status, 200);
    assert.equal((await exact.json()).result[0].price.isLowerBound, false);
    const cleared = await app.post({
        action: 'update',
        ids: [item.id],
        patch: { price: null },
    });
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).result[0].price, null);
});

test('price privacy defaults on, persists off and survives older preference writers', async (t) => {
    const app = await application(t);
    const read = async () =>
        (
            await app.route.GET(new Request('http://localhost/api/archive'))
        ).json();
    const initial = await read();
    assert.equal(initial.preferences.blurPrices, true);
    const preferences = { ...initial.preferences, blurPrices: false };
    assert.equal(
        (await app.post({ action: 'preferences', preferences })).status,
        200,
    );
    assert.equal((await read()).preferences.blurPrices, false);
    delete preferences.blurPrices;
    assert.equal(
        (await app.post({ action: 'preferences', preferences })).status,
        200,
    );
    assert.equal((await read()).preferences.blurPrices, false);
    assert.equal(
        (
            await app.post({
                action: 'preferences',
                preferences: { ...preferences, blurPrices: 'yes' },
            })
        ).status,
        400,
    );
    assert.equal((await read()).preferences.blurPrices, false);
});

test('legacy outfit mode is normalized on read while new saves require current modes and available owned pieces', async (t) => {
    const app = await application(t);
    assert.equal((await app.post(importItems(1))).status, 200);
    const read = async () =>
        (
            await app.route.GET(new Request('http://localhost/api/archive'))
        ).json();
    const item = (await read()).items[0];
    const legacy = {
        id: 'legacy-outfit',
        name: 'Saved earlier',
        owner: 'me',
        occasion: 'streetwear',
        temperature: 'mild',
        itemIds: [item.id],
        notes: '',
        createdAt: '2026-09-08T00:00:00Z',
    };
    const account = app
        .db()
        .prepare('SELECT account_id FROM wardrobe_items LIMIT 1')
        .get().account_id;
    app.db()
        .prepare('INSERT INTO outfits (id,account_id,data) VALUES (?,?,?)')
        .run('legacy-outfit', account, JSON.stringify(legacy));
    assert.equal((await read()).outfits[0].occasion, 'everyday');
    assert.equal(
        JSON.parse(
            app
                .db()
                .prepare('SELECT data FROM outfits WHERE id=?')
                .get('legacy-outfit').data,
        ).occasion,
        'streetwear',
    );
    for (const occasion of ['everyday', 'smart', 'dapper']) {
        const saved = await app.post({
            action: 'save_outfit',
            outfit: { ...legacy, occasion },
        });
        assert.equal(saved.status, 200);
        assert.equal((await saved.json()).result.occasion, occasion);
    }
    assert.equal(
        (await app.post({ action: 'save_outfit', outfit: legacy })).status,
        400,
    );
    for (const patch of [
        { owner: 'wife' },
        { status: 'wishlist' },
        { category: 'accessory', name: 'Travel duffel' },
    ]) {
        const result = await app.post({
            action: 'add',
            item: {
                name: 'Unavailable outfit fixture',
                category: 'shirt',
                owner: 'me',
                ...patch,
            },
        });
        assert.equal(result.status, 200);
        const candidate = (await result.json()).result;
        assert.equal(
            (
                await app.post({
                    action: 'save_outfit',
                    outfit: {
                        ...legacy,
                        occasion: 'dapper',
                        itemIds: [candidate.id],
                    },
                })
            ).status,
            400,
        );
    }
    assert.equal(
        (await app.post({ action: 'trash', ids: [item.id] })).status,
        200,
    );
    assert.equal(
        (
            await app.post({
                action: 'save_outfit',
                outfit: { ...legacy, occasion: 'dapper' },
            })
        ).status,
        400,
    );
});

test('sale currency persists independently of private USD valuation through edits, Trash, restore and database reopen', async (t) => {
    const app = await application(t);
    const db = app.db();
    registerPhotos(db, ['currency-photo']);
    const price = {
        amount: 125,
        currency: 'USD',
        basis: 'estimate',
        checkedAt: '2026-09-14',
    };
    const sale = {
        published: true,
        askingPrice: 1250.25,
        currency: 'INR',
        description: 'Available locally',
        photoIds: ['currency-photo'],
    };
    const added = await app.post({
        action: 'add',
        item: { name: 'INR camera', imageId: 'currency-photo', price, sale },
    });
    assert.equal(added.status, 200);
    const item = (await added.json()).result;
    assert.deepEqual(item.sale, sale);
    assert.deepEqual(item.price, price);
    assert.deepEqual((await readArchive(app)).items[0].sale, sale);
    for (const patch of [
        { notes: 'Pickup preferred' },
        { favourite: true },
        { status: 'wishlist' },
        { status: 'owned' },
    ]) {
        const updated = await app.post({
            action: 'update',
            ids: [item.id],
            patch,
        });
        assert.equal(updated.status, 200);
        const changed = (await updated.json()).result[0];
        assert.equal(changed.sale.currency, 'INR');
        assert.equal(changed.sale.askingPrice, 1250.25);
        assert.deepEqual(changed.price, price);
    }
    for (const action of ['trash', 'restore']) {
        const response = await app.post({ action, ids: [item.id] });
        assert.equal(response.status, 200);
        const changed = (await response.json()).result[0];
        assert.deepEqual(changed.sale, { ...sale, published: false });
        assert.deepEqual(changed.price, price);
    }
    db.close();
    db.open();
    const reopened = (await readArchive(app)).items[0];
    assert.deepEqual(reopened.sale, { ...sale, published: false });
    assert.deepEqual(reopened.price, price);
    assert.equal(reopened.status, 'owned');
    const stored = JSON.parse(
        db
            .prepare('SELECT data FROM wardrobe_items WHERE id=?')
            .get(`owner:${item.id}`).data,
    );
    assert.deepEqual(stored.sale, reopened.sale);
    assert.deepEqual(stored.price, price);
});

test('sale currency omission supports legacy listings and preserves each existing currency on replacement writes', async (t) => {
    const app = await application(t);
    app.db();
    const sale = {
        published: false,
        askingPrice: 120.25,
        description: 'Legacy asking price',
        photoIds: [],
    };
    const ids = [];
    for (const currency of [undefined, 'INR', 'EUR']) {
        const added = await app.post({
            action: 'add',
            item: {
                name: `Compatibility ${currency || 'legacy USD'}`,
                sale: {
                    ...sale,
                    ...(currency === undefined ? {} : { currency }),
                },
            },
        });
        assert.equal(added.status, 200);
        const item = (await added.json()).result;
        assert.equal(item.sale.currency, currency);
        ids.push(item.id);
    }
    const replacement = {
        ...sale,
        askingPrice: 250.75,
        description: 'Written by an older client',
    };
    const updated = await app.post({
        action: 'update',
        ids,
        patch: { sale: replacement },
    });
    assert.equal(updated.status, 200);
    const items = (await updated.json()).result;
    for (const [index, currency] of [undefined, 'INR', 'EUR'].entries()) {
        const item = items.find((entry) => entry.id === ids[index]);
        assert.equal(item.sale.currency, currency);
        assert.equal(item.sale.askingPrice, replacement.askingPrice);
        assert.equal(item.sale.description, replacement.description);
    }
    const explicit = await app.post({
        action: 'update',
        ids: [ids[1]],
        patch: { sale: { ...replacement, currency: 'GBP' } },
    });
    assert.equal(explicit.status, 200);
    const changed = (await explicit.json()).result[0];
    assert.equal(changed.sale.currency, 'GBP');
    assert.equal(changed.sale.askingPrice, replacement.askingPrice);
    const cleared = await app.post({
        action: 'update',
        ids,
        patch: { sale: null },
    });
    assert.equal(cleared.status, 200);
    assert((await cleared.json()).result.every((item) => item.sale === null));
    assert((await readArchive(app)).items.every((item) => item.sale === null));
});

test('sale currency accepts supported uppercase codes and rejects invalid values without changing the archive', async (t) => {
    const app = await application(t);
    app.db();
    const sale = {
        published: false,
        askingPrice: 120,
        description: '',
        photoIds: [],
    };
    let itemId;
    for (const currency of [
        'USD',
        'INR',
        'EUR',
        'GBP',
        'AED',
        'SGD',
        'AUD',
        'CAD',
        'CHF',
        'JPY',
    ]) {
        const response = await app.post({
            action: 'add',
            item: { name: `${currency} listing`, sale: { ...sale, currency } },
        });
        assert.equal(response.status, 200, currency);
        const item = (await response.json()).result;
        assert.equal(item.sale.currency, currency);
        itemId = item.id;
    }
    const before = await readArchive(app);
    for (const currency of [
        'XYZ',
        '',
        'usd',
        'inr',
        ' INR ',
        null,
        1,
        false,
        [],
        {},
    ]) {
        for (const askingPrice of [120, null]) {
            const invalidSale = { ...sale, askingPrice, currency };
            for (const body of [
                {
                    action: 'add',
                    item: { name: 'Invalid currency', sale: invalidSale },
                },
                {
                    action: 'update',
                    ids: [itemId],
                    patch: { notes: 'Must not be saved', sale: invalidSale },
                },
            ]) {
                const response = await app.post(body);
                assert.equal(response.status, 400, JSON.stringify(body));
                assert.match((await response.json()).error, /currency/i);
            }
        }
    }
    assert.deepEqual(await readArchive(app), before);
});

test('sale currency precision applies before any add or bulk update is saved', async (t) => {
    const app = await application(t);
    app.db();
    const sale = {
        published: false,
        askingPrice: 120,
        description: '',
        photoIds: [],
    };
    const ids = [];
    for (const currency of ['INR', 'JPY']) {
        const added = await app.post({
            action: 'add',
            item: {
                name: `${currency} precision`,
                sale: { ...sale, currency },
            },
        });
        assert.equal(added.status, 200);
        ids.push((await added.json()).result.id);
    }
    const before = await readArchive(app);
    for (const [currency, askingPrice] of [
        ['JPY', 120.5],
        ['JPY', 120.01],
        ['INR', 120.001],
        ['USD', 120.001],
    ]) {
        for (const body of [
            {
                action: 'add',
                item: {
                    name: 'Invalid precision',
                    sale: { ...sale, currency, askingPrice },
                },
            },
            {
                action: 'update',
                ids,
                patch: { sale: { ...sale, currency, askingPrice } },
            },
        ]) {
            const response = await app.post(body);
            assert.equal(response.status, 400, JSON.stringify(body));
            assert.match(
                (await response.json()).error,
                /asking price|decimal|whole/i,
            );
        }
    }
    const legacyBulk = await app.post({
        action: 'update',
        ids,
        patch: { sale: { ...sale, askingPrice: 120.25 } },
    });
    assert.equal(legacyBulk.status, 400);
    assert.deepEqual(await readArchive(app), before);
    for (const [index, askingPrice] of [120.25, 121].entries()) {
        const updated = await app.post({
            action: 'update',
            ids: [ids[index]],
            patch: { sale: { ...sale, askingPrice } },
        });
        assert.equal(updated.status, 200);
        const item = (await updated.json()).result[0];
        assert.equal(item.sale.currency, index === 0 ? 'INR' : 'JPY');
        assert.equal(item.sale.askingPrice, askingPrice);
    }
});

test('shop publication requires an owned item and stops after Wishlist, Trash and return imports', async (t) => {
    const app = await application(t);
    const db = app.db();
    registerPhotos(db, ['public-photo']);
    const sale = {
        published: true,
        askingPrice: 120,
        description: 'Public listing',
        photoIds: ['public-photo'],
    };
    const added = await app.post({
        action: 'add',
        item: { name: 'Sale camera', imageId: 'public-photo', sale },
    });
    assert.equal(added.status, 200);
    const item = (await added.json()).result;
    const moved = await app.post({
        action: 'update',
        ids: [item.id],
        patch: { status: 'wishlist' },
    });
    assert.equal(moved.status, 200);
    assert.equal((await moved.json()).result[0].sale.published, false);
    const republishWish = await app.post({
        action: 'update',
        ids: [item.id],
        patch: { sale },
    });
    assert.equal(republishWish.status, 400);
    const republished = await app.post({
        action: 'update',
        ids: [item.id],
        patch: { status: 'owned', sale },
    });
    assert.equal(republished.status, 200);
    const trashed = await app.post({ action: 'trash', ids: [item.id] });
    assert.equal((await trashed.json()).result[0].sale.published, false);
    const restored = await app.post({ action: 'restore', ids: [item.id] });
    assert.equal((await restored.json()).result[0].sale.published, false);
    const invalidNew = await app.post({
        action: 'add',
        item: {
            name: 'Unowned sale',
            status: 'wishlist',
            imageId: 'public-photo',
            sale,
        },
    });
    assert.equal(invalidNew.status, 400);
});

async function readArchive(app) {
    return (
        await app.route.GET(new Request('http://localhost/api/archive'))
    ).json();
}

async function createTestGroup(app, name, itemIds = [], requestId) {
    const response = await app.post({
        action: 'create_group',
        group: { name, itemIds },
        ...(requestId ? { requestId } : {}),
    });
    assert.equal(response.status, 200);
    return (await response.json()).result;
}

test('schema 3 migrates a version 2 archive without inferring groups or changing existing records', async (t) => {
    const { shopMigration } = await import('../db/shop-migration.ts');
    const original = piece(1);
    const app = await application(t, (db) => {
        db.exec(migration);
        db.exec(shopMigration);
        db.exec('PRAGMA user_version=2');
        db.prepare(
            'INSERT INTO wardrobe_items (id,account_id,source_key,purchase_id,data) VALUES (?,?,?,?,?)',
        ).run(
            'owner:item1',
            'owner',
            original.sourceKey,
            null,
            JSON.stringify(original),
        );
    });
    const archive = await readArchive(app);
    assert.equal(versionAt(app.databasePath), 4);
    assert.deepEqual(archive.groups, []);
    assert.deepEqual(
        JSON.parse(
            app.db().prepare('SELECT data FROM wardrobe_items').get().data,
        ),
        original,
    );
    assert.equal(
        app.db().prepare('SELECT COUNT(*) count FROM shop_inquiries').get()
            .count,
        0,
    );
});

test('manual groups create, rename, remove members and delete without rewriting individual items', async (t) => {
    const app = await application(t);
    assert.equal((await app.post(importItems(2))).status, 200);
    const before = await readArchive(app);
    assert.deepEqual(before.groups, []);
    const ids = before.items.map((item) => item.id);
    const group = await createTestGroup(
        app,
        '  Oxford colours  ',
        ids,
        'group:test:1',
    );
    assert.equal(group.name, 'Oxford colours');
    assert.deepEqual(group.itemIds, ids);
    const updated = await app.post({
        action: 'update_group',
        id: group.id,
        patch: { name: 'Oxford variants', itemIds: [ids[0]] },
        expectedUpdatedAt: group.updatedAt,
    });
    assert.equal(updated.status, 200);
    const next = (await updated.json()).result;
    assert.ok(next.updatedAt > group.updatedAt);
    assert.equal(next.createdAt, group.createdAt);
    const retried = await createTestGroup(
        app,
        'Retry must not overwrite',
        [],
        'group:test:1',
    );
    assert.deepEqual(retried, next);
    assert.equal((await readArchive(app)).groups.length, 1);
    assert.deepEqual((await readArchive(app)).items, before.items);
    assert.equal(
        (
            await app.post({
                action: 'delete_group',
                id: group.id,
                expectedUpdatedAt: group.updatedAt,
            })
        ).status,
        409,
    );
    assert.equal(
        (
            await app.post({
                action: 'delete_group',
                id: group.id,
                expectedUpdatedAt: next.updatedAt,
            })
        ).status,
        200,
    );
    assert.deepEqual((await readArchive(app)).groups, []);
    assert.deepEqual((await readArchive(app)).items, before.items);
});

test('membership moves are explicit, atomic, guarded and account scoped', async (t) => {
    const app = await application(t);
    await app.post(importItems(2));
    const before = await readArchive(app);
    const [one, two] = before.items;
    const first = await createTestGroup(app, 'First', [one.id]);
    const second = await createTestGroup(app, 'Second', [two.id]);
    assert.equal(
        (
            await app.post({
                action: 'create_group',
                group: { name: 'Duplicate', itemIds: [one.id] },
            })
        ).status,
        409,
    );
    assert.equal(
        (
            await app.post({
                action: 'update_group',
                id: second.id,
                patch: { itemIds: [one.id, two.id] },
                expectedUpdatedAt: second.updatedAt,
            })
        ).status,
        409,
    );
    assert.equal(
        (
            await app.post({
                action: 'set_item_group',
                itemId: one.id,
                groupId: second.id,
                expectedGroupId: null,
            })
        ).status,
        409,
    );
    const moved = await app.post({
        action: 'set_item_group',
        itemId: one.id,
        groupId: second.id,
        expectedGroupId: first.id,
    });
    assert.equal(moved.status, 200);
    const groups = (await moved.json()).archive.groups;
    assert.deepEqual(groups.find((group) => group.id === first.id).itemIds, []);
    assert.deepEqual(groups.find((group) => group.id === second.id).itemIds, [
        two.id,
        one.id,
    ]);
    assert.ok(
        groups.every(
            (group) =>
                group.updatedAt >
                (group.id === first.id ? first : second).updatedAt,
        ),
    );
    assert.equal(
        (
            await app.post({
                action: 'update_group',
                id: second.id,
                patch: { name: 'Stale' },
                expectedUpdatedAt: second.updatedAt,
            })
        ).status,
        409,
    );
    assert.equal(
        (
            await app.post({
                action: 'set_item_group',
                itemId: one.id,
                groupId: null,
                expectedGroupId: first.id,
            })
        ).status,
        409,
    );
    assert.equal(
        (
            await app.post({
                action: 'set_item_group',
                itemId: one.id,
                groupId: null,
                expectedGroupId: second.id,
            })
        ).status,
        200,
    );
    assert.deepEqual((await readArchive(app)).items, before.items);
    const foreign = { ...piece('foreign'), id: 'foreign-item' };
    app.db()
        .prepare(
            'INSERT INTO wardrobe_items (id,account_id,source_key,purchase_id,data) VALUES (?,?,?,?,?)',
        )
        .run(
            'other:foreign-item',
            'other',
            foreign.sourceKey,
            null,
            JSON.stringify(foreign),
        );
    const foreignGroup = {
        ...first,
        id: 'foreign-group',
        itemIds: [foreign.id],
    };
    app.db()
        .prepare('INSERT INTO item_groups (id,account_id,data) VALUES (?,?,?)')
        .run('other:foreign-group', 'other', JSON.stringify(foreignGroup));
    assert.equal(
        (
            await app.post({
                action: 'create_group',
                group: { name: 'Foreign', itemIds: [foreign.id] },
            })
        ).status,
        400,
    );
    assert.equal(
        (
            await app.post({
                action: 'set_item_group',
                itemId: one.id,
                groupId: foreignGroup.id,
                expectedGroupId: null,
            })
        ).status,
        404,
    );
    assert.equal(
        (
            await app.post({
                action: 'delete_group',
                id: foreignGroup.id,
                expectedUpdatedAt: foreignGroup.updatedAt,
            })
        ).status,
        404,
    );
    assert.equal(
        (await readArchive(app)).groups.some(
            (group) => group.id === foreignGroup.id,
        ),
        false,
    );
});

test('a failed second group write rolls back the whole move and leaves the write queue usable', async (t) => {
    const app = await application(t);
    await app.post(importItems(1));
    const item = (await readArchive(app)).items[0];
    const first = await createTestGroup(app, 'First', [item.id]);
    const second = await createTestGroup(app, 'Second');
    const before = (await readArchive(app)).groups;
    app.db().exec(
        `CREATE TRIGGER reject_group_move BEFORE UPDATE ON item_groups WHEN NEW.id='owner:${second.id}' BEGIN SELECT RAISE(ABORT,'injected group move failure'); END;`,
    );
    const move = {
        action: 'set_item_group',
        itemId: item.id,
        groupId: second.id,
        expectedGroupId: first.id,
    };
    assert.equal((await app.post(move)).status, 500);
    assert.deepEqual((await readArchive(app)).groups, before);
    app.db().exec('DROP TRIGGER reject_group_move');
    assert.equal((await app.post(move)).status, 200);
    assert.deepEqual(
        (await readArchive(app)).groups.find((group) => group.id === second.id)
            .itemIds,
        [item.id],
    );
});

test('group membership survives Trash, restore and reimport while new trashed additions are rejected', async (t) => {
    const app = await application(t);
    await app.post(importItems(1));
    const item = (await readArchive(app)).items[0];
    const group = await createTestGroup(app, 'Kept group', [item.id]);
    assert.equal(
        (await app.post({ action: 'trash', ids: [item.id] })).status,
        200,
    );
    assert.deepEqual((await readArchive(app)).groups[0], group);
    assert.equal((await app.post(importItems(1))).status, 200);
    assert.deepEqual((await readArchive(app)).groups[0], group);
    assert.equal(
        (
            await app.post({
                action: 'update_group',
                id: group.id,
                patch: { name: 'Renamed in Trash', itemIds: [item.id] },
                expectedUpdatedAt: group.updatedAt,
            })
        ).status,
        200,
    );
    assert.equal(
        (
            await app.post({
                action: 'set_item_group',
                itemId: item.id,
                groupId: null,
                expectedGroupId: group.id,
            })
        ).status,
        200,
    );
    assert.equal(
        (
            await app.post({
                action: 'set_item_group',
                itemId: item.id,
                groupId: group.id,
                expectedGroupId: null,
            })
        ).status,
        400,
    );
    assert.equal(
        (
            await app.post({
                action: 'create_group',
                group: { name: 'New', itemIds: [item.id] },
            })
        ).status,
        400,
    );
    assert.equal(
        (await app.post({ action: 'restore', ids: [item.id] })).status,
        200,
    );
    assert.equal(
        (
            await app.post({
                action: 'set_item_group',
                itemId: item.id,
                groupId: group.id,
                expectedGroupId: null,
            })
        ).status,
        200,
    );
});

test('group input rejects malformed names, memberships, patches and missing concurrency values', async (t) => {
    const app = await application(t);
    await app.post(importItems(1));
    const item = (await readArchive(app)).items[0];
    for (const group of [
        null,
        [],
        {},
        { name: ' ' },
        { name: 'x'.repeat(121) },
        { name: 'Valid', itemIds: null },
        { name: 'Valid', itemIds: ['missing'] },
        { name: 'Valid', itemIds: [item.id, item.id] },
        { name: 'Valid', itemIds: [{}] },
        {
            name: 'Valid',
            itemIds: Array.from({ length: 501 }, (_, i) => `id${i}`),
        },
    ])
        assert.equal(
            (await app.post({ action: 'create_group', group })).status,
            400,
            JSON.stringify(group),
        );
    const group = await createTestGroup(app, 'Valid');
    for (const patch of [
        null,
        [],
        {},
        { name: '' },
        { id: 'replacement' },
        { itemIds: 'wrong' },
    ])
        assert.equal(
            (
                await app.post({
                    action: 'update_group',
                    id: group.id,
                    patch,
                    expectedUpdatedAt: group.updatedAt,
                })
            ).status,
            400,
        );
    assert.equal(
        (
            await app.post({
                action: 'update_group',
                id: group.id,
                patch: { name: 'New' },
            })
        ).status,
        400,
    );
    assert.equal(
        (await app.post({ action: 'delete_group', id: group.id })).status,
        400,
    );
    assert.equal(
        (
            await app.post({
                action: 'set_item_group',
                itemId: item.id,
                groupId: group.id,
            })
        ).status,
        400,
    );
    assert.equal(
        (
            await app.post({
                action: 'create_group',
                requestId: 'bad key',
                group: { name: 'Valid' },
            })
        ).status,
        400,
    );
    assert.deepEqual((await readArchive(app)).groups, [group]);
});

test('consumable purchase details and evolving tasting notes persist and can be cleared', async (t) => {
    const app = await application(t);
    const price = {
        amount: 18.5,
        currency: 'USD',
        basis: 'purchase',
        checkedAt: '2026-10-19',
    };
    const response = await app.post({
        action: 'add',
        item: {
            name: 'Specialty coffee',
            brand: 'Travel roaster',
            category: 'coffee',
            purchaseDate: '2026-10-10',
            purchaseVendor: 'Local roaster',
            purchaseLocation: 'Lisbon, Portugal',
            notes: 'Floral; try a coarser grind.',
            price,
        },
    });
    assert.equal(response.status, 200);
    const item = (await response.json()).result;
    assert.equal(item.purchaseDate, '2026-10-10');
    assert.equal(item.purchaseVendor, 'Local roaster');
    assert.equal(item.purchaseLocation, 'Lisbon, Portugal');
    assert.deepEqual(item.price, price);
    assert.equal(
        (
            await app.post({
                action: 'update',
                ids: [item.id],
                patch: { notes: 'Finished the bag. Would buy again.' },
            })
        ).status,
        200,
    );
    const saved = (await readArchive(app)).items.find(
        (entry) => entry.id === item.id,
    );
    assert.equal(saved.notes, 'Finished the bag. Would buy again.');
    assert.equal(saved.purchaseVendor, item.purchaseVendor);
    assert.equal(saved.purchaseDate, item.purchaseDate);
    assert.deepEqual(saved.price, price);
    for (const patch of [
        { purchaseDate: '2026-02-30' },
        { purchaseDate: 'not-a-date' },
        { purchaseDate: null },
        { purchaseVendor: 123 },
        { purchaseVendor: 'x'.repeat(201) },
        { purchaseLocation: [] },
    ]) {
        assert.equal(
            (await app.post({ action: 'update', ids: [item.id], patch }))
                .status,
            400,
        );
    }
    assert.equal(
        (
            await app.post({
                action: 'update',
                ids: [item.id],
                patch: {
                    purchaseDate: '',
                    purchaseVendor: '',
                    purchaseLocation: '',
                },
            })
        ).status,
        200,
    );
    const cleared = (await readArchive(app)).items.find(
        (entry) => entry.id === item.id,
    );
    assert.equal(cleared.purchaseDate, '');
    assert.equal(cleared.purchaseVendor, '');
    assert.equal(cleared.purchaseLocation, '');
    assert.equal(cleared.notes, saved.notes);
});
