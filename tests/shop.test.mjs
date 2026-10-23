import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import {
  publicListing,
  validateSale,
  validateInquiry,
  shopPrice,
  shopCurrencies,
  shopCurrencyDigits,
  emptySale,
} from '../app/wardrobe/shop-model.ts';

test('shop prices use whole dollar rounding and retain the unspecified-price label', () => {
  assert.equal(shopPrice(125.01), '$126');
  assert.equal(shopPrice(125), '$125');
  assert.equal(shopPrice(null), 'Ask for price');
});

test('shop currency formatting preserves the amount and uses its chosen units without conversion', () => {
  assert.equal(shopPrice(125000.01, 'INR'), '₹1,25,001');
  assert.equal(shopPrice(125.01, 'EUR'), '€126');
  assert.equal(shopPrice(125.01, 'GBP'), '£126');
  assert.equal(shopPrice(125000, 'JPY'), '¥125,000');
  for (const { value, fractionDigits } of shopCurrencies) {
    assert.equal(shopCurrencyDigits(value), fractionDigits);
    assert.equal(shopPrice(null, value), 'Ask for price');
  }
  assert.throws(
    () => shopCurrencyDigits('unknown'),
    /supported asking-price currency/,
  );
  assert.throws(
    () => shopPrice(100, 'unknown'),
    /supported asking-price currency/,
  );
  assert.equal(emptySale().currency, 'USD');
});

const repository = new URL('../', import.meta.url);
const migration = await readFile(
  new URL('drizzle/0000_sour_jackal.sql', repository),
  'utf8',
);
function piece(overrides = {}) {
  return {
    id: 'desk',
    sourceKey: 'manual:desk',
    purchaseId: null,
    owner: 'me',
    status: 'owned',
    name: 'Oak desk',
    brand: 'Maker',
    category: 'furniture',
    colour: 'Oak',
    size: '120 cm',
    quantity: 1,
    notes: 'PRIVATE NOTES',
    fit: '',
    pattern: '',
    warmth: 'light',
    favourite: false,
    price: {
      amount: 9000,
      currency: 'USD',
      basis: 'purchase',
      sourceUrl: 'https://private.example/receipt',
    },
    imageId: 'public-photo',
    photos: [
      {
        imageId: 'public-photo',
        kind: 'product',
        alt: 'PRIVATE CAPTION',
        sourceUrl: 'https://private.example/photo',
      },
      { imageId: 'private-photo', kind: 'personal', alt: 'PRIVATE FAMILY' },
    ],
    productUrl: 'https://private.example/product',
    updatedAt: '2026-09-09T00:00:00Z',
    sale: {
      published: true,
      askingPrice: 120,
      description: 'A lightly used desk.',
      photoIds: ['public-photo'],
    },
    ...overrides,
  };
}
async function application(t, seed) {
  const directory = await mkdtemp(join(tmpdir(), 'mystuff-shop-'));
  const data = join(directory, 'data');
  await mkdir(data);
  const databasePath = join(data, 'archive.sqlite');
  if (seed) {
    const connection = new DatabaseSync(databasePath);
    try {
      seed(connection);
    } finally {
      connection.close();
    }
  }
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
    ['app/installation.ts', 'installation'],
    ['app/wardrobe/server.ts', 'server'],
    ['app/wardrobe/shop-server.ts', 'shop-server'],
    ['app/api/shop/inquiries/route.ts', 'inquiries-route'],
    ['app/shop/images/[itemId]/[imageId]/route.ts', 'image-route'],
  ];
  for (const [source, name] of modules) {
    let code = await readFile(new URL(source, repository), 'utf8');
    for (const [specifier, replacement] of [
      ['@/app/wardrobe/server', './server.mjs'],
      ['@/app/wardrobe/shop-server', './shop-server.mjs'],
      ['@/app/auth', './auth.mjs'],
      ['@/app/installation', './installation.mjs'],
      ['argon2', import.meta.resolve('argon2')],
      ['./wardrobe/model', './model.mjs'],
      ['@/db', './db.mjs'],
      ...[
        'model',
        'item-price',
        'shop-model',
        'server',
        'initial-schema',
        'shop-migration',
        'group-migration',
        'installation',
        'platform-migration',
      ].map((name) => [`./${name}`, `./${name}.mjs`]),
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
  const storage = await import(pathToFileURL(join(directory, 'db.mjs')).href);
  const server = await import(
    pathToFileURL(join(directory, 'shop-server.mjs')).href
  );
  const route = await import(
    pathToFileURL(join(directory, 'inquiries-route.mjs')).href
  );
  const images = await import(
    pathToFileURL(join(directory, 'image-route.mjs')).href
  );
  const connection = storage.getDb().connection;
  connection.prepare(
    "UPDATE installation_settings SET data=json_set(data,'$.features.shop',json('true')) WHERE installation_id='main'",
  ).run();
  t.after(async () => {
    try {
      connection.close();
    } catch {
      /* Restart tests already close this connection. */
    }
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  });
  return {
    connection,
    storage,
    server,
    route,
    images,
    databasePath,
    directory,
    insert(item) {
      connection
        .prepare(
          'INSERT INTO wardrobe_items(id,account_id,source_key,purchase_id,data) VALUES (?,?,?,?,?)',
        )
        .run(
          `owner:${item.id}`,
          'owner',
          item.sourceKey,
          item.purchaseId,
          JSON.stringify(item),
        );
    },
    post(value, headers = {}) {
      return route.POST(
        new Request('https://shop.example/api/shop/inquiries', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://shop.example',
            ...headers,
          },
          body: JSON.stringify(value),
        }),
      );
    },
  };
}
const inquiry = (overrides = {}) => ({
  itemId: 'desk',
  name: 'Buyer',
  contact: 'buyer@example.com',
  comment: 'Can I collect it?',
  website: '',
  ...overrides,
});

test('public projection exposes only explicit sale details and selected image IDs', () => {
  const listing = publicListing(piece());
  assert.deepEqual(listing, {
    id: 'desk',
    name: 'Oak desk',
    brand: 'Maker',
    category: 'furniture',
    colour: 'Oak',
    size: '120 cm',
    description: 'A lightly used desk.',
    askingPrice: 120,
    currency: 'USD',
    photoIds: ['public-photo'],
  });
  assert.equal(JSON.stringify(listing).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(listing).includes('private.example'), false);
  for (const status of [
    'wishlist',
    'review',
    'retired',
    'outgrown',
    'returned',
    'trashed',
  ])
    assert.equal(publicListing(piece({ status })), null);
  assert.equal(publicListing(piece({ sale: undefined })), null);
  assert.equal(publicListing(piece({ sale: null })), null);
  assert.equal(
    publicListing(piece({ sale: { ...piece().sale, published: false } })),
    null,
  );
  assert.equal(
    publicListing(
      piece({ sale: { ...piece().sale, photoIds: ['not-attached'] } }),
    ),
    null,
  );
  assert.equal(
    publicListing(piece({ facts: { fulfillment: 'returned' } })),
    null,
  );
});

test('public listings resolve legacy USD and expose only the explicit asking currency', () => {
  assert.equal(publicListing(piece()).currency, 'USD');
  for (const { value } of shopCurrencies) {
    const item = piece({ sale: { ...piece().sale, currency: value } });
    const listing = publicListing(item);
    assert.equal(listing.currency, value);
    assert.equal(listing.askingPrice, 120);
    assert.equal(item.price.currency, 'USD');
    assert.equal(item.price.amount, 9000);
    assert.equal('price' in listing, false);
    assert.equal('facts' in listing, false);
    assert.equal(JSON.stringify(listing).includes('PRIVATE'), false);
  }
});

test('asking currency is validated even for unpublished and unspecified-price listings', () => {
  for (const currency of [null, '', 'usd', 'INR ', 'ZZZ', 123, true, [], {}]) {
    for (const askingPrice of [null, 120]) {
      for (const published of [true, false]) {
        const sale = { ...piece().sale, currency, askingPrice, published };
        assert.match(
          validateSale(sale, piece()),
          /supported asking-price currency/,
        );
        assert.equal(publicListing(piece({ sale })), null);
      }
    }
  }
  for (const { value } of shopCurrencies) {
    assert.equal(
      validateSale({ ...piece().sale, currency: value }, piece()),
      null,
    );
    assert.equal(
      validateSale(
        { ...piece().sale, currency: value, askingPrice: null },
        piece(),
      ),
      null,
    );
  }
});

test('asking prices use whole yen and at most two decimal places for the other supported currencies', () => {
  for (const { value, fractionDigits } of shopCurrencies) {
    const sale = { ...piece().sale, currency: value };
    assert.equal(validateSale({ ...sale, askingPrice: 123 }, piece()), null);
    assert.match(
      validateSale({ ...sale, askingPrice: 123.001 }, piece()),
      /asking price/,
    );
    if (fractionDigits === 0) {
      assert.match(
        validateSale({ ...sale, askingPrice: 123.01 }, piece()),
        /whole number/,
      );
      assert.match(
        validateSale({ ...sale, askingPrice: 123.000000001 }, piece()),
        /whole number/,
      );
    } else {
      assert.equal(
        validateSale({ ...sale, askingPrice: 123.01 }, piece()),
        null,
      );
    }
  }
});

test('publication requires owned items and chosen images; clearing and blank prices are valid', () => {
  assert.equal(validateSale(null, piece()), null);
  assert.equal(
    validateSale({ ...piece().sale, askingPrice: null }, piece()),
    null,
  );
  assert.match(
    validateSale(piece().sale, piece({ status: 'wishlist' })),
    /Only owned/,
  );
  assert.match(
    validateSale({ ...piece().sale, photoIds: [] }, piece()),
    /at least one/,
  );
  for (const askingPrice of [-1, 0, NaN, Infinity, '20', 1.234])
    assert.match(
      validateSale({ ...piece().sale, askingPrice }, piece()),
      /asking price/,
    );
  assert.match(
    validateSale(
      { ...piece().sale, photoIds: ['public-photo', 'public-photo'] },
      piece(),
    ),
    /different photos/,
  );
  assert.equal(
    typeof validateInquiry(inquiry({ contact: '+91 98765 43210' })),
    'object',
  );
  assert.equal(
    typeof validateInquiry(inquiry({ contact: 'no-contact' })),
    'string',
  );
  assert.equal(
    typeof validateInquiry(inquiry({ contact: 'a\u0001@example.com' })),
    'string',
  );
});

test('current schema migrates an existing archive without exposing items or losing inquiries on reopen', async (t) => {
  const app = await application(t, (db) => {
    db.exec(migration);
    db.exec('PRAGMA user_version=1');
    db.prepare('INSERT INTO preferences(account_id,data) VALUES (?,?)').run(
      'owner',
      '{"saved":true}',
    );
  });
  assert.equal(
    app.connection.prepare('PRAGMA user_version').get().user_version,
    4,
  );
  assert.equal(
    app.connection.prepare('SELECT data FROM preferences').get().data,
    '{"saved":true}',
  );
  assert.deepEqual(await app.server.getShopListings(), []);
  app.insert(piece());
  await app.server.submitShopInquiry(inquiry());
  app.connection.close();
  const reopened = await import(
    `${pathToFileURL(join(app.directory, 'db.mjs')).href}?restart=1`
  );
  const db = reopened.getDb().connection;
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
    assert.equal(
      db.prepare('SELECT contact FROM shop_inquiries').get().contact,
      'buyer@example.com',
    );
  } finally {
    db.close();
  }
});

test('public selection joins raw purchase IDs and excludes returned or travelling purchases', async (t) => {
  const app = await application(t);
  app.insert(piece({ purchaseId: 'purchase-1' }));
  app.connection
    .prepare(
      'INSERT INTO purchase_lines(id,account_id,source_key,data) VALUES (?,?,?,?)',
    )
    .run(
      'owner:purchase-1',
      'owner',
      'purchase-1',
      JSON.stringify({
        fulfillment: 'delivered',
        photos: [
          {
            imageId: 'public-photo',
            kind: 'product',
            alt: 'PRIVATE PURCHASE CAPTION',
          },
        ],
      }),
    );
  assert.equal((await app.server.getShopListing('desk')).name, 'Oak desk');
  for (const fulfillment of ['returned', 'cancelled', 'in_transit']) {
    app.connection
      .prepare('UPDATE purchase_lines SET data=?')
      .run(JSON.stringify({ fulfillment }));
    assert.equal(await app.server.getShopListing('desk'), null);
    assert.deepEqual(await app.server.getShopListings(), []);
    await assert.rejects(
      app.server.submitShopInquiry(inquiry()),
      (error) => error.status === 404,
    );
  }
});

test('public photos require current publication and selection, even with a known private image ID', async (t) => {
  const app = await application(t);
  app.insert(piece());
  for (const id of ['public-photo', 'private-photo']) {
    app.connection
      .prepare(
        'INSERT INTO images(id,account_id,object_key,content_type) VALUES (?,?,?,?)',
      )
      .run(`owner:${id}`, 'owner', `owner/${id}.png`, 'image/png');
    await app.storage
      .getImageStore()
      .put(`owner/${id}.png`, new Uint8Array([1, 2, 3]));
  }
  const get = (imageId) =>
    app.images.GET(
      new Request(`https://shop.example/shop/images/desk/${imageId}`),
      { params: Promise.resolve({ itemId: 'desk', imageId }) },
    );
  const selected = await get('public-photo');
  assert.equal(selected.status, 200);
  assert.equal(selected.headers.get('cache-control'), 'no-store');
  assert.equal((await get('private-photo')).status, 404);
  app.connection
    .prepare('UPDATE wardrobe_items SET data=?')
    .run(
      JSON.stringify(piece({ sale: { ...piece().sale, published: false } })),
    );
  assert.equal((await get('public-photo')).status, 404);
});

test('contact form stores private inquiries with an opaque receipt and blocks cross-origin or oversized bodies', async (t) => {
  const app = await application(t);
  app.insert(piece());
  const accepted = await app.post(inquiry());
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { ok: true });
  assert.equal(
    app.connection.prepare('SELECT count(*) AS count FROM shop_inquiries').get()
      .count,
    1,
  );
  assert.equal(
    (await app.post(inquiry(), { Origin: 'https://evil.example' })).status,
    403,
  );
  assert.equal(
    (await app.post(inquiry(), { 'Sec-Fetch-Site': 'cross-site' })).status,
    403,
  );
  assert.equal(
    (await app.post(inquiry({ comment: 'x'.repeat(9000) }))).status,
    413,
  );
  assert.equal(
    (await app.post(inquiry({ comment: 'x'.repeat(1001) }))).status,
    400,
  );
  assert.equal(
    (await app.post(inquiry({ website: 'spam.example' }))).status,
    200,
  );
  assert.equal(
    app.connection.prepare('SELECT count(*) AS count FROM shop_inquiries').get()
      .count,
    1,
  );
});

test('inquiry reads and deletion require the signed-in seller, with no bearer shortcut', async (t) => {
  const app = await application(t);
  app.insert(piece());
  await app.server.submitShopInquiry(inquiry());
  const url = 'http://localhost/api/shop/inquiries';
  assert.equal(
    (
      await app.route.GET(
        new Request(url, { headers: { Authorization: 'Bearer any-token' } }),
      )
    ).status,
    401,
  );
  process.env.ARCHIVE_LOCAL_PREVIEW = '0';
  process.env.NODE_ENV = 'production';
  const denied = await app.route.GET(new Request(url));
  assert.equal(denied.status, 401);
  assert.equal((await denied.text()).includes('buyer@example.com'), false);
  const deniedDelete = await app.route.DELETE(
    new Request(url, {
      method: 'DELETE',
      headers: {
        Origin: 'http://localhost',
        'Content-Type': 'application/json',
      },
      body: '{"id":"missing"}',
    }),
  );
  assert.equal(deniedDelete.status, 401);
  process.env.ARCHIVE_LOCAL_PREVIEW = '1';
  process.env.NODE_ENV = 'development';
  const result = await (await app.route.GET(new Request(url))).json();
  assert.equal(result.total, 1);
  assert.equal(result.inquiries[0].contact, 'buyer@example.com');
  const deleted = await app.route.DELETE(
    new Request(url, {
      method: 'DELETE',
      headers: {
        Origin: 'http://localhost',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: result.inquiries[0].id }),
    }),
  );
  assert.equal(deleted.status, 200);
  assert.equal(
    app.connection.prepare('SELECT count(*) AS count FROM shop_inquiries').get()
      .count,
    0,
  );
});

test('fixed global request buckets persist and cap attempts without growing with client headers', async (t) => {
  const app = await application(t);
  const now = Date.now();
  for (let attempt = 0; attempt < 8; attempt++)
    app.server.consumeInquiryLimit(now);
  assert.throws(
    () => app.server.consumeInquiryLimit(now),
    (error) => error.status === 429,
  );
  assert.equal(
    app.connection
      .prepare('SELECT count(*) AS count FROM shop_rate_limits')
      .get().count,
    2,
  );
  app.connection.close();
  const db = new DatabaseSync(app.databasePath);
  try {
    assert.equal(
      db
        .prepare("SELECT attempts FROM shop_rate_limits WHERE bucket='minute'")
        .get().attempts,
      9,
    );
  } finally {
    db.close();
  }
});
