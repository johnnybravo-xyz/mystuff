import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

test(
  'built public shop isolates sale fields, galleries and buyer inquiries from the private archive',
  { timeout: 60_000 },
  async () => {
    const entry = resolve('dist/standalone/server.js');
    await access(entry);
    const directory = await mkdtemp(join(tmpdir(), 'mystuff-shop-production-'));
    const origin = 'https://mystuff.example';
    const cookie = 'shop_oidc=isolated-fixture';
    const verifier = createServer((request, response) => {
      response.writeHead(
        request.headers.cookie === cookie ? 204 : 401,
        request.headers.cookie === cookie
          ? { 'x-auth-request-user': 'owner' }
          : {},
      );
      response.end();
    });
    const socket = createNetServer();
    let server;
    let db;
    let logs = '';
    try {
      const bytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yY9sAAAAASUVORK5CYII=',
        'base64',
      );
      await mkdir(join(directory, 'images', 'owner'), { recursive: true });
      db = new DatabaseSync(join(directory, 'archive.sqlite'));
      db.exec(await readFile(resolve('drizzle/0000_sour_jackal.sql'), 'utf8'));
      db.exec('PRAGMA user_version=1');
      const item = {
        id: 'public-desk',
        sourceKey: 'manual:public-desk',
        purchaseId: 'desk-purchase',
        owner: 'me',
        status: 'owned',
        name: 'Public desk fixture',
        brand: 'Fixture brand',
        category: 'furniture',
        colour: 'Oak',
        size: '120 cm',
        quantity: 1,
        fit: '',
        pattern: '',
        warmth: 'light',
        favourite: false,
        notes: 'SECRET_OWNER_NOTES',
        imageId: 'cover',
        productUrl: 'https://private.example/SECRET_PRODUCT_URL',
        updatedAt: '2026-09-09T00:00:00Z',
        sale: {
          published: false,
          askingPrice: null,
          currency: 'USD',
          description: '',
          photoIds: [],
        },
        price: {
          amount: 999123,
          currency: 'USD',
          basis: 'purchase',
          isLowerBound: true,
          checkedAt: '2026-09-09',
          notes: 'SECRET_PRICE_NOTES',
        },
        photos: ['cover', 'detail', 'SECRET_PRIVATE_PHOTO'].map((imageId) => ({
          imageId,
          kind: 'product',
          alt: 'SECRET_CAPTION',
          sourceUrl: 'https://private.example/SECRET_PHOTO_SOURCE',
        })),
      };
      const purchase = {
        id: 'desk-purchase',
        sourceKey: 'fixture:purchase',
        fulfillment: 'delivered',
        orderId: 'SECRET_ORDER_ID',
        paid: 777123,
        price: 777123,
        photos: [],
      };
      db.prepare(
        'INSERT INTO purchase_lines(id,account_id,source_key,data) VALUES (?,?,?,?)',
      ).run(
        'owner:desk-purchase',
        'owner',
        purchase.sourceKey,
        JSON.stringify(purchase),
      );
      db.prepare(
        'INSERT INTO wardrobe_items(id,account_id,source_key,purchase_id,data) VALUES (?,?,?,?,?)',
      ).run(
        'owner:public-desk',
        'owner',
        item.sourceKey,
        item.purchaseId,
        JSON.stringify(item),
      );
      for (const id of ['cover', 'detail', 'SECRET_PRIVATE_PHOTO']) {
        const key = `owner/${id}.png`;
        await writeFile(join(directory, 'images', key), bytes);
        db.prepare(
          'INSERT INTO images(id,account_id,object_key,content_type) VALUES (?,?,?,?)',
        ).run(`owner:${id}`, 'owner', key, 'image/png');
      }
      verifier.listen(0, '127.0.0.1');
      await once(verifier, 'listening');
      socket.listen(0, '127.0.0.1');
      await once(socket, 'listening');
      const port = socket.address().port;
      await new Promise((done) => socket.close(done));
      const env = {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(port),
        ARCHIVE_DATA_DIR: directory,
        ARCHIVE_AUTH_MODE: 'oidc',
        ARCHIVE_PUBLIC_URL: origin,
        ARCHIVE_OIDC_AUTH_URL: `http://127.0.0.1:${verifier.address().port}/oauth2/auth`,
        ARCHIVE_OIDC_LOGIN_URL: 'https://auth.example/oauth2/start',
        ARCHIVE_OIDC_LOGOUT_URL: 'https://auth.example/oauth2/sign_out',
        VINEXT_TRUSTED_HOSTS: 'mystuff.example',
      };
      delete env.ARCHIVE_LOCAL_PREVIEW;
      server = spawn(process.execPath, [entry], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      server.stdout.on('data', (data) => {
        logs = (logs + data).slice(-8000);
      });
      server.stderr.on('data', (data) => {
        logs = (logs + data).slice(-8000);
      });
      const request = (path, options = {}) =>
        fetch(`http://127.0.0.1:${port}${path}`, {
          method: options.method || 'GET',
          redirect: 'manual',
          headers: {
            'x-forwarded-host': 'mystuff.example',
            'x-forwarded-proto': 'https',
            ...(options.cookie ? { cookie: options.cookie } : {}),
            ...(options.body
              ? { origin, 'content-type': 'application/json' }
              : {}),
            ...options.headers,
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        });
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (server.exitCode !== null)
          throw new Error(`Shop test server exited: ${logs}`);
        try {
          ready = (await request('/shop')).status === 200;
        } catch {}
        if (ready) break;
        await new Promise((done) => setTimeout(done, 100));
      }
      assert.ok(ready, logs);
      assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
      const empty = await (await request('/shop')).text();
      assert.match(empty, /Nothing for sale just yet/);
      assert.doesNotMatch(empty, /Public desk fixture|SECRET_|999123|777123/);
      assert.equal((await request('/shop/public-desk')).status, 404);
      assert.equal((await request('/api/shop/inquiries')).status, 401);
      assert.equal((await request('/api/archive')).status, 401);
      assert.equal((await request('/')).status, 307);
      const variantResponse = await request('/api/archive', {
        method: 'POST',
        cookie,
        body: {
          action: 'add',
          item: {
            name: 'SECRET_OTHER_VARIANT',
            category: 'furniture',
            colour: 'Black',
          },
        },
      });
      assert.equal(variantResponse.status, 200);
      const variant = (await variantResponse.json()).result;
      const groupResponse = await request('/api/archive', {
        method: 'POST',
        cookie,
        body: {
          action: 'create_group',
          group: {
            name: 'SECRET_PRIVATE_GROUP',
            itemIds: [item.id, variant.id],
          },
        },
      });
      assert.equal(groupResponse.status, 200);
      const group = (await groupResponse.json()).result;
      assert.equal((await request('/groups/' + group.id)).status, 307);
      assert.equal(
        (await request('/groups/not-in-this-archive', { cookie })).status,
        404,
      );
      const privateGroup = await request('/groups/' + group.id, { cookie });
      assert.equal(privateGroup.status, 200);
      assert.match(await privateGroup.text(), /SECRET_PRIVATE_GROUP/);
      assert.equal(
        (
          await request('/api/archive', {
            method: 'POST',
            cookie,
            body: { action: 'trash', ids: [variant.id] },
          })
        ).status,
        200,
      );
      const afterTrash = await (
        await request('/groups/' + group.id, { cookie })
      ).text();
      const groupMain =
        afterTrash.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0] || '';
      assert.match(groupMain, /Public desk fixture/);
      assert.doesNotMatch(groupMain, /SECRET_OTHER_VARIANT/);
      assert.equal(
        (
          await request('/api/archive', {
            method: 'POST',
            cookie,
            body: { action: 'restore', ids: [variant.id] },
          })
        ).status,
        200,
      );
      const sale = {
        published: true,
        askingPrice: 125,
        description: 'PUBLIC_SALE_DESCRIPTION',
        photoIds: ['cover', 'detail'],
      };
      const publish = await request('/api/archive', {
        method: 'POST',
        cookie,
        body: {
          action: 'update',
          ids: [item.id],
          patch: {
            sale,
          },
        },
      });
      assert.equal(publish.status, 200, await publish.text());
      for (const path of ['/shop', '/shop/public-desk']) {
        const response = await request(path);
        assert.equal(response.status, 200);
        const html = await response.text();
        assert.match(html, /Public desk fixture/);
        assert.match(html, />\$125(?:<|\s)/);
        assert.doesNotMatch(
          html,
          /SECRET_|999,?123|777,?123|private\.example|isLowerBound|lower bound/,
        );
        assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /Over\s*\$125/);
        assert.doesNotMatch(html, new RegExp(group.id));
        assert.doesNotMatch(html, new RegExp(variant.id));
        if (path === '/shop') {
          assert.match(html, /<a[^>]*class="shop-card"[^>]*href="\/shop\/public-desk"/);
          assert.match(html, /View details &amp; leave a comment/);
        } else {
          assert.match(html, /Leave a comment/);
          assert.match(html, /<textarea[^>]*name="comment"/);
          assert.match(html, /PUBLIC_SALE_DESCRIPTION/);
          assert.match(html, /View photo 2/);
          assert.match(html, /Send inquiry/);
        }
        const asset = html.match(
          /(?:src|href)="(\/_next\/static\/[^"]+)"/,
        )?.[1];
        assert.ok(asset, 'Public pages should reference their static bundles.');
        assert.equal((await request(asset)).status, 200);
      }
      const reprice = await request('/api/archive', {
        method: 'POST',
        cookie,
        body: {
          action: 'update',
          ids: [item.id],
          patch: { sale: { ...sale, currency: 'INR', askingPrice: 125000.5 } },
        },
      });
      assert.equal(reprice.status, 200);
      const repriced = (await reprice.json()).archive.items.find(
        (record) => record.id === item.id,
      );
      assert.equal(repriced.sale.currency, 'INR');
      assert.equal(repriced.sale.askingPrice, 125000.5);
      assert.deepEqual(repriced.price, item.price);
      for (const path of ['/shop', '/shop/public-desk']) {
        const response = await request(path);
        assert.equal(response.status, 200);
        const html = await response.text();
        const main = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0] || '';
        const visible = main.replace(/<[^>]*>/g, '');
        assert.match(visible, /₹1,25,001\s*INR/);
        assert.doesNotMatch(visible, /USD|\$125/);
        assert.doesNotMatch(html, /SECRET_|999,?123|777,?123|private\.example/);
      }
      const integration = await (
        await request('/api/integration', { cookie })
      ).json();
      assert.ok(
        integration.sale.currencies.some(
          (entry) => entry.code === 'INR' && entry.fractionDigits === 2,
        ),
      );
      assert.ok(
        integration.sale.currencies.some(
          (entry) => entry.code === 'JPY' && entry.fractionDigits === 0,
        ),
      );
      const unspecified = await request('/api/archive', {
        method: 'POST',
        cookie,
        body: {
          action: 'update',
          ids: [item.id],
          patch: { sale: { ...sale, askingPrice: null } },
        },
      });
      assert.equal(unspecified.status, 200);
      assert.equal(
        (await unspecified.json()).archive.items.find(
          (record) => record.id === item.id,
        ).sale.currency,
        'INR',
      );
      for (const path of ['/shop', '/shop/public-desk']) {
        const html = await (await request(path)).text();
        const main = html.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0] || '';
        assert.match(main, /Ask for price/);
        assert.doesNotMatch(main, /₹|\$125|>INR</);
      }
      for (const id of ['cover', 'detail']) {
        const response = await request(`/shop/images/public-desk/${id}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      }
      assert.equal(
        (await request('/shop/images/public-desk/SECRET_PRIVATE_PHOTO')).status,
        404,
      );
      assert.equal((await request('/api/images/cover')).status, 401);
      const body = {
        itemId: item.id,
        name: 'BUYER_PRIVATE_NAME',
        contact: 'private-buyer@example.test',
        comment: 'BUYER_PRIVATE_COMMENT',
        website: '',
      };
      assert.equal(
        (
          await request('/api/shop/inquiries', {
            method: 'POST',
            body,
            headers: { origin: 'https://evil.example' },
          })
        ).status,
        403,
      );
      const submitted = await request('/api/shop/inquiries', {
        method: 'POST',
        body,
      });
      assert.equal(submitted.status, 200);
      assert.deepEqual(await submitted.json(), { ok: true });
      const privateRead = await request('/api/shop/inquiries', { cookie });
      assert.equal(privateRead.status, 200);
      const stored = await privateRead.json();
      assert.equal(stored.total, 1);
      assert.equal(stored.inquiries[0].contact, body.contact);
      assert.equal(stored.inquiries[0].comment, body.comment);
      assert.equal(stored.inquiries[0].itemId, item.id);
      assert.equal(
        (
          await request('/api/shop/inquiries', {
            headers: { authorization: 'Bearer fixture' },
          })
        ).status,
        401,
      );
      for (const path of ['/shop', '/shop/public-desk'])
        assert.doesNotMatch(
          await (await request(path)).text(),
          /BUYER_PRIVATE|private-buyer/,
        );
      db.prepare('UPDATE purchase_lines SET data=? WHERE id=?').run(
        JSON.stringify({ ...purchase, fulfillment: 'returned' }),
        'owner:desk-purchase',
      );
      assert.equal((await request('/shop/public-desk')).status, 404);
      assert.equal(
        (await request('/shop/images/public-desk/cover')).status,
        404,
      );
      assert.equal(
        (await request('/api/shop/inquiries', { method: 'POST', body })).status,
        404,
      );
      db.prepare('UPDATE purchase_lines SET data=? WHERE id=?').run(
        JSON.stringify(purchase),
        'owner:desk-purchase',
      );
      const withdraw = await request('/api/archive', {
        method: 'POST',
        cookie,
        body: { action: 'update', ids: [item.id], patch: { sale: null } },
      });
      assert.equal(withdraw.status, 200);
      assert.equal((await request('/shop/public-desk')).status, 404);
      const deleted = await request('/api/shop/inquiries', {
        method: 'DELETE',
        cookie,
        body: { id: stored.inquiries[0].id },
      });
      assert.equal(deleted.status, 200);
      assert.equal(
        db.prepare('SELECT count(*) AS count FROM shop_inquiries').get().count,
        0,
      );
    } finally {
      if (server && server.exitCode === null && server.signalCode === null) {
        const exited = once(server, 'exit');
        server.kill('SIGTERM');
        await exited;
      }
      verifier.closeAllConnections();
      if (verifier.listening) await new Promise((done) => verifier.close(done));
      if (socket.listening) await new Promise((done) => socket.close(done));
      db?.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
