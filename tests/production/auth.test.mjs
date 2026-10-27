import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

async function freePort() {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = server.address().port;
    await new Promise((done) => server.close(done));
    return port;
}

test(
    'production navigation sends visitors through sign-in and returns them to their collection',
    { timeout: 60_000 },
    async () => {
        const entry = resolve('dist/standalone/server.js');
        await access(entry).catch(() => {
            throw new Error(
                'Run bun run build before bun run test:production.',
            );
        });
        const directory = await mkdtemp(join(tmpdir(), 'mystuff-auth-test-'));
        const port = await freePort();
        const password = randomBytes(24).toString('hex');
        const agentToken = randomBytes(32).toString('base64url');
        const origin = 'https://mystuff.example';
        const env = {
            ...process.env,
            NODE_ENV: 'production',
            HOST: '127.0.0.1',
            PORT: String(port),
            ARCHIVE_DATA_DIR: directory,
            ARCHIVE_AUTH_MODE: 'password',
            ARCHIVE_PUBLIC_URL: origin,
            VINEXT_TRUSTED_HOSTS: 'mystuff.example',
            ARCHIVE_PASSWORD: password,
            ARCHIVE_AGENT_TOKEN_SHA256: createHash('sha256')
                .update(agentToken)
                .digest('hex'),
            ARCHIVE_SESSION_SECRET: randomBytes(48).toString('hex'),
        };
        delete env.ARCHIVE_LOCAL_PREVIEW;
        const server = spawn(process.execPath, [entry], {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let logs = '';
        server.stdout.on('data', (data) => {
            logs = (logs + data).slice(-8000);
        });
        server.stderr.on('data', (data) => {
            logs = (logs + data).slice(-8000);
        });
        async function request(path, { method = 'GET', body, cookie } = {}) {
            return fetch(`http://127.0.0.1:${port}${path}`, {
                method,
                redirect: 'manual',
                headers: {
                    'x-forwarded-host': 'mystuff.example',
                    'x-forwarded-proto': 'https',
                    ...(cookie ? { cookie } : {}),
                    ...(method !== 'GET'
                        ? { origin, 'content-type': 'application/json' }
                        : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
        }
        function expectRedirect(response, path) {
            assert.ok(
                [303, 307, 308].includes(response.status),
                `${path}: expected navigation redirect, received ${response.status}. ${logs}`,
            );
            return new URL(response.headers.get('location'), origin);
        }
        try {
            let ready = false;
            for (let attempt = 0; attempt < 100; attempt++) {
                if (server.exitCode !== null)
                    throw new Error(`Production server exited: ${logs}`);
                try {
                    ready = (await request('/signin')).status === 200;
                } catch {}
                if (ready) break;
                await new Promise((done) => setTimeout(done, 100));
            }
            assert.ok(ready, `Production server did not start: ${logs}`);
            for (const path of [
                '/',
                '/?collection=home&owner=household',
                '/pieces/private-item',
            ]) {
                const location = expectRedirect(await request(path), path);
                assert.equal(location.pathname, '/signin');
                const returnTo = location.searchParams.get('return_to');
                assert.ok(returnTo?.startsWith('/'));
                if (path.includes('collection=home'))
                    assert.ok(returnTo.includes('collection=home'));
                if (path.startsWith('/pieces/')) assert.equal(returnTo, path);
            }
            assert.equal(
                expectRedirect(
                    await request('/', { cookie: 'archive_session=invalid' }),
                    'expired session',
                ).pathname,
                '/signin',
            );
            assert.equal((await request('/api/archive')).status, 401);
            assert.equal(
                (await request('/api/images/private-image')).status,
                401,
            );
            const login = await request('/api/session', {
                method: 'POST',
                body: { password },
            });
            assert.equal(login.status, 200);
            const session = login.headers.get('set-cookie');
            assert.match(session, /Secure/);
            assert.match(session, /HttpOnly/);
            const cookie = session.split(';')[0];
            const home = await request('/', { cookie });
            assert.equal(home.status, 200);
            assert.match(await home.text(), /All your stuff/);
            const returned = expectRedirect(
                await request('/signin?return_to=%2F%3Fcollection%3Dhome', {
                    cookie,
                }),
                'already signed in',
            );
            assert.equal(
                returned.pathname + returned.search,
                '/?collection=home',
            );
            assert.equal(
                (await request('/pieces/private-item', { cookie })).status,
                404,
            );
            const integrationHeaders = {
                'x-forwarded-host': 'mystuff.example',
                'x-forwarded-proto': 'https',
                authorization: 'Bearer ' + agentToken,
            };
            const agentRequest = (path, body) =>
                fetch(`http://127.0.0.1:${port}${path}`, {
                    method: body ? 'POST' : 'GET',
                    redirect: 'manual',
                    headers: {
                        ...integrationHeaders,
                        ...(body ? { 'content-type': 'application/json' } : {}),
                    },
                    ...(body ? { body: JSON.stringify(body) } : {}),
                });
            const schema = await agentRequest('/api/integration');
            assert.equal(schema.status, 200);
            const contract = await schema.json();
            assert.equal(contract.version, 1);
            for (const action of [
                'create_group',
                'update_group',
                'delete_group',
                'set_item_group',
            ])
                assert.ok(contract.actions.includes(action));
            assert.equal(contract.groups.maximumMembers, 500);
            assert.ok(
                contract.statuses.some((status) => status.id === 'wishlist'),
            );
            assert.equal((await request('/api/integration')).status, 401);
            assert.equal(
                (await agentRequest('/')).status,
                307,
                'Bearer does not open the browser UI',
            );
            const form = new FormData();
            form.set(
                'photo',
                new Blob(
                    [
                        Buffer.from(
                            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yY9sAAAAASUVORK5CYII=',
                            'base64',
                        ),
                    ],
                    { type: 'image/png' },
                ),
                'test.png',
            );
            const upload = await fetch(`http://127.0.0.1:${port}/api/images`, {
                method: 'POST',
                headers: integrationHeaders,
                body: form,
            });
            assert.equal(upload.status, 200);
            const photo = await upload.json();
            const agentAdd = {
                action: 'add',
                requestId: 'production:phone:1',
                item: {
                    name: 'Test phone',
                    category: 'phone',
                    price: {
                        amount: 87123.45,
                        currency: 'USD',
                        basis: 'purchase',
                        isLowerBound: true,
                        checkedAt: '2026-09-09',
                        notes: 'Private price provenance',
                    },
                    imageId: photo.id,
                    photos: [
                        {
                            imageId: photo.id,
                            kind: 'product',
                            alt: 'Test upload',
                        },
                    ],
                },
            };
            const added = await agentRequest('/api/archive', agentAdd);
            assert.equal(added.status, 200);
            const item = (await added.json()).result;
            assert.equal(item.price.isLowerBound, true);
            const createdGroupResponse = await agentRequest('/api/archive', {
                action: 'create_group',
                group: { name: 'Integration group' },
                requestId: 'production:group:1',
            });
            assert.equal(createdGroupResponse.status, 200);
            const createdGroup = (await createdGroupResponse.json()).result;
            const assignedGroupResponse = await agentRequest('/api/archive', {
                action: 'set_item_group',
                itemId: item.id,
                groupId: createdGroup.id,
                expectedGroupId: null,
            });
            assert.equal(assignedGroupResponse.status, 200);
            const assignedGroup = (
                await assignedGroupResponse.json()
            ).archive.groups.find((entry) => entry.id === createdGroup.id);
            const renamedGroupResponse = await agentRequest('/api/archive', {
                action: 'update_group',
                id: createdGroup.id,
                patch: { name: 'Renamed through integration' },
                expectedUpdatedAt: assignedGroup.updatedAt,
            });
            assert.equal(renamedGroupResponse.status, 200);
            const renamedGroup = (await renamedGroupResponse.json()).result;
            assert.equal(
                (
                    await agentRequest('/api/archive', {
                        action: 'delete_group',
                        id: createdGroup.id,
                        expectedUpdatedAt: renamedGroup.updatedAt,
                    })
                ).status,
                200,
            );
            const mainMarkup = (html) =>
                html.match(/<main\b[^>]*>[\s\S]*?<\/main>/)?.[0] || '';
            const plainText = (html) =>
                html
                    .replace(/<[^>]*>/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            const amountText = (html) =>
                plainText(
                    html.match(
                        /<span class="price-amount[^"]*"[^>]*>([\s\S]*?)<\/span>/,
                    )?.[1] || '',
                );
            const overview = mainMarkup(
                await (await request('/pieces/' + item.id, { cookie })).text(),
            );
            assert.match(
                overview,
                /class="price-amount price-concealed" aria-hidden="true"/,
            );
            assert.match(overview, /aria-label="Reveal price"/);
            assert.equal(amountText(overview), 'Over US$87,124 USD');
            assert.match(plainText(overview), /Purchase price lower bound/);
            assert.doesNotMatch(overview, /Private price provenance/);
            assert.doesNotMatch(overview, /Blur prices by default/);
            const settings = mainMarkup(
                await (await request('/?view=settings', { cookie })).text(),
            );
            assert.equal(
                (settings.match(/Blur prices by default/g) || []).length,
                1,
            );
            assert.match(settings, /id="archive-blur-prices"/);
            assert.match(
                settings,
                /aria-labelledby="archive-blur-prices-label"/,
            );
            assert.match(settings, /Price privacy/);
            assert.doesNotMatch(settings, /Belongings owner/);
            const outfitPage = mainMarkup(
                await (
                    await request('/?view=outfits&owner=me', { cookie })
                ).text(),
            );
            for (const mode of ['Everyday', 'Smart', 'Dapper'])
                assert.match(outfitPage, new RegExp(`>${mode}</option>`));
            assert.doesNotMatch(outfitPage, /Streetwear/);
            for (const path of ['/', '/?view=manage', '/?view=export']) {
                const html = mainMarkup(
                    await (await request(path, { cookie })).text(),
                );
                assert.doesNotMatch(
                    html,
                    /87,12[34]|87123|Private price provenance|price-amount/,
                );
            }
            const archive = await (await agentRequest('/api/archive')).json();
            assert.equal(archive.preferences.blurPrices, true);
            assert.equal(
                archive.items.find((entry) => entry.id === item.id).price
                    .isLowerBound,
                true,
            );
            const preferences = await request('/api/archive', {
                method: 'POST',
                cookie,
                body: {
                    action: 'preferences',
                    preferences: { ...archive.preferences, blurPrices: false },
                },
            });
            assert.equal(preferences.status, 200);
            const visible = mainMarkup(
                await (await request('/pieces/' + item.id, { cookie })).text(),
            );
            assert.match(visible, /class="price-amount"/);
            assert.match(visible, /aria-label="Hide price"/);
            assert.equal(amountText(visible), 'Over US$87,124 USD');
            assert.match(plainText(visible), /Purchase price lower bound/);
            assert.match(visible, /Private price provenance/);
            const wished = await agentRequest('/api/archive', {
                action: 'add',
                requestId: 'production:wishlist:1',
                item: {
                    name: 'Desired test lens',
                    category: 'lens',
                    status: 'wishlist',
                },
            });
            assert.equal(wished.status, 200);
            const wish = (await wished.json()).result;
            const wishPage = mainMarkup(
                await (
                    await request('/?view=wishlist&collection=tech&owner=me', {
                        cookie,
                    })
                ).text(),
            );
            assert.match(wishPage, /Desired test lens/);
            assert.match(wishPage, /Add to wishlist/);
            assert.doesNotMatch(
                mainMarkup(await (await request('/', { cookie })).text()),
                /Desired test lens/,
            );
            const wishOverview = mainMarkup(
                await (await request('/pieces/' + wish.id, { cookie })).text(),
            );
            assert.match(wishOverview, /Move to owned/);
            const moved = await agentRequest('/api/archive', {
                action: 'update',
                ids: [wish.id],
                patch: { status: 'owned' },
            });
            assert.equal(moved.status, 200);
            assert.match(
                mainMarkup(await (await request('/', { cookie })).text()),
                /Desired test lens/,
            );
            assert.doesNotMatch(
                mainMarkup(
                    await (await request('/?view=wishlist', { cookie })).text(),
                ),
                /Desired test lens/,
            );
            assert.equal(
                (await (await agentRequest('/api/archive', agentAdd)).json())
                    .result.id,
                item.id,
            );
            assert.equal(
                (await agentRequest('/api/images/' + photo.id)).status,
                200,
            );
            assert.equal(
                (await request('/api/images/' + photo.id)).status,
                401,
            );
            const updated = await agentRequest('/api/archive', {
                action: 'update',
                ids: [item.id],
                patch: { notes: 'From agent' },
                expectedUpdatedAt: { [item.id]: item.updatedAt },
            });
            assert.equal(updated.status, 200);
            assert.equal(
                (
                    await agentRequest('/api/archive', {
                        action: 'trash',
                        ids: [item.id],
                    })
                ).status,
                200,
            );
            const restored = await agentRequest('/api/archive', {
                action: 'restore',
                ids: [item.id],
            });
            assert.equal(restored.status, 200);
            assert.equal((await restored.json()).result[0].status, 'owned');
            assert.equal(
                (
                    await agentRequest('/api/archive', {
                        action: 'preferences',
                        preferences: {},
                    })
                ).status,
                403,
            );
            assert.equal(
                (
                    await agentRequest('/api/product-preview', {
                        url: 'https://127.0.0.1/',
                    })
                ).status,
                400,
            );
            const logout = await request('/api/session', {
                method: 'DELETE',
                cookie,
            });
            assert.equal(logout.status, 200);
            assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
            assert.equal(
                expectRedirect(await request('/'), 'signed out').pathname,
                '/signin',
            );
        } finally {
            if (server.exitCode === null) {
                server.kill('SIGTERM');
                await once(server, 'exit');
            }
            await rm(directory, { recursive: true, force: true });
        }
    },
);
