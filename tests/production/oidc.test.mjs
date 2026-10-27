import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

async function freePort() {
    const server = createNetServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = server.address().port;
    await new Promise((done) => server.close(done));
    return port;
}

test(
    'production OIDC mode verifies provider cookies and never falls back to local sign-in',
    { timeout: 60_000 },
    async () => {
        const entry = resolve('dist/standalone/server.js');
        await access(entry).catch(() => {
            throw new Error(
                'Run bun run build before bun run test:production.',
            );
        });
        const directory = await mkdtemp(join(tmpdir(), 'mystuff-oidc-test-'));
        const origin = 'https://mystuff.example';
        const loginUrl = 'https://auth.example/oauth2/start';
        const logoutUrl = `https://auth.example/oauth2/sign_out?rd=${encodeURIComponent(origin + '/')}`;
        const oidcCookie = 'oidc_session=valid-production-fixture';
        const password = randomBytes(24).toString('hex');
        const secret = randomBytes(48).toString('hex');
        const agentToken = randomBytes(32).toString('base64url');
        // A correctly signed legacy cookie must still be unusable in OIDC mode.
        const payload = `v1.${Date.now()}.${randomBytes(18).toString('base64url')}`;
        const signature = createHmac('sha256', secret)
            .update('archive-session\0')
            .update(password)
            .update('\0')
            .update(payload)
            .digest('hex');
        const legacyCookie = `archive_session=${payload}.${signature}`;
        let verifierMode = 'normal';
        let redirectedVerifierCalls = 0;
        const verifierRequests = [];
        const verifier = createHttpServer((request, response) => {
            verifierRequests.push({
                url: request.url,
                headers: request.headers,
            });
            if (request.url === '/redirected-auth') {
                redirectedVerifierCalls++;
                response.writeHead(204, {
                    'x-auth-request-user': 'verified-owner',
                });
            } else if (request.url !== '/oauth2/auth') {
                response.writeHead(404);
            } else if (verifierMode === 'redirect') {
                response.writeHead(302, { location: '/redirected-auth' });
            } else if (verifierMode === 'outage') {
                response.writeHead(503, {
                    'x-auth-request-user': 'must-not-be-accepted',
                });
            } else if (verifierMode === 'disconnect') {
                request.socket.destroy();
                return;
            } else if (verifierMode === 'missing-identity') {
                response.writeHead(204);
            } else if (verifierMode === 'empty-identity') {
                response.writeHead(204, { 'x-auth-request-user': '' });
            } else if (verifierMode === 'rejected-with-identity') {
                response.writeHead(401, {
                    'x-auth-request-user': 'must-not-be-accepted',
                });
            } else if (request.headers.cookie === oidcCookie) {
                response.writeHead(204, {
                    'x-auth-request-user': 'verified-owner',
                });
            } else {
                response.writeHead(401);
            }
            response.end();
        });
        let server;
        let logs = '';
        try {
            verifier.listen(0, '127.0.0.1');
            await once(verifier, 'listening');
            const port = await freePort();
            const authUrl = `http://127.0.0.1:${verifier.address().port}/oauth2/auth`;
            const env = {
                ...process.env,
                NODE_ENV: 'production',
                HOST: '127.0.0.1',
                PORT: String(port),
                VINEXT_TRUSTED_HOSTS: 'mystuff.example',
                ARCHIVE_DATA_DIR: directory,
                ARCHIVE_AUTH_MODE: 'oidc',
                ARCHIVE_PUBLIC_URL: origin,
                ARCHIVE_OIDC_AUTH_URL: authUrl,
                ARCHIVE_OIDC_LOGIN_URL: loginUrl,
                ARCHIVE_OIDC_LOGOUT_URL: logoutUrl,
                ARCHIVE_PASSWORD: password,
                ARCHIVE_SESSION_SECRET: secret,
                ARCHIVE_AGENT_TOKEN_SHA256: createHash('sha256')
                    .update(agentToken)
                    .digest('hex'),
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
            async function request(
                path,
                { method = 'GET', body, cookie, bearer, headers = {} } = {},
            ) {
                const form = body instanceof FormData;
                return fetch(`http://127.0.0.1:${port}${path}`, {
                    method,
                    redirect: 'manual',
                    headers: {
                        'x-forwarded-host': 'mystuff.example',
                        'x-forwarded-proto': 'https',
                        ...(cookie ? { cookie } : {}),
                        ...(bearer
                            ? { authorization: `Bearer ${bearer}` }
                            : {}),
                        ...(method !== 'GET' && !bearer ? { origin } : {}),
                        ...(body !== undefined && !form
                            ? { 'content-type': 'application/json' }
                            : {}),
                        ...headers,
                    },
                    ...(body === undefined
                        ? {}
                        : { body: form ? body : JSON.stringify(body) }),
                });
            }
            function oidcRedirect(response, path) {
                assert.equal(
                    response.status,
                    307,
                    `${path}: expected OIDC redirect. ${logs}`,
                );
                const location = new URL(
                    response.headers.get('location'),
                    origin,
                );
                assert.equal(location.origin + location.pathname, loginUrl);
                const returnTo = new URL(location.searchParams.get('rd'));
                assert.equal(returnTo.origin, origin);
                assert.equal(returnTo.username, '');
                assert.equal(returnTo.password, '');
                return returnTo;
            }
            let ready = false;
            for (let attempt = 0; attempt < 100; attempt++) {
                if (server.exitCode !== null)
                    throw new Error(`Production server exited: ${logs}`);
                try {
                    ready = (await request('/api/archive')).status === 401;
                } catch {}
                if (ready) break;
                await new Promise((done) => setTimeout(done, 100));
            }
            assert.ok(ready, `Production server did not start: ${logs}`);
            assert.equal(oidcRedirect(await request('/'), '/').pathname, '/');
            const collectionReturn = oidcRedirect(
                await request('/?collection=home&owner=household'),
                'collection',
            );
            assert.equal(
                collectionReturn.searchParams.get('collection'),
                'home',
            );
            assert.equal(
                collectionReturn.searchParams.get('owner'),
                'household',
            );
            assert.equal(
                oidcRedirect(await request('/pieces/private-item'), 'item')
                    .pathname,
                '/pieces/private-item',
            );
            for (const path of [
                '/signin?return_to=https%3A%2F%2Fevil.example%2Fsteal',
                '/signin?return_to=%2F%2Fevil.example%2Fsteal',
                '/signin?return_to=%2F%5Cevil.example%2Fsteal',
                '/signin?return_to=%2Fapi%2Farchive',
                '/signin?rd=https%3A%2F%2Fevil.example%2Fsteal',
                '/?rd=https%3A%2F%2Fevil.example%2Fsteal',
            ])
                assert.equal(
                    oidcRedirect(await request(path), path).pathname,
                    '/',
                );
            const forgedHeaders = {
                'x-auth-request-user': 'owner',
                'x-auth-request-email': 'owner@example.com',
                'x-forwarded-user': 'owner',
                'x-forwarded-email': 'owner@example.com',
                'remote-user': 'owner',
            };
            for (const options of [
                { headers: forgedHeaders },
                { cookie: legacyCookie },
                {
                    cookie: 'oidc_session=expired-production-fixture',
                    headers: forgedHeaders,
                },
            ]) {
                oidcRedirect(
                    await request('/', options),
                    'unverified identity',
                );
                assert.equal(
                    (await request('/api/archive', options)).status,
                    401,
                );
                assert.equal(
                    (await request('/api/images/private-image', options))
                        .status,
                    401,
                );
            }
            for (const cookie of [undefined, oidcCookie]) {
                const login = await request('/api/session', {
                    method: 'POST',
                    body: { password },
                    cookie,
                });
                assert.equal(
                    login.status,
                    403,
                    'OIDC mode never accepts an app password',
                );
                assert.equal(login.headers.get('set-cookie'), null);
            }
            const home = await request('/', {
                cookie: oidcCookie,
                headers: forgedHeaders,
            });
            assert.equal(home.status, 200);
            assert.match(await home.text(), /All your stuff/);
            const signedIn = await request('/signin', { cookie: oidcCookie });
            assert.equal(signedIn.status, 307);
            assert.equal(
                new URL(signedIn.headers.get('location'), origin).href,
                origin + '/',
            );
            const verifiedRequests = verifierRequests.filter(
                (entry) => entry.headers.cookie === oidcCookie,
            );
            assert.ok(verifiedRequests.length > 0);
            for (const verifiedRequest of verifiedRequests) {
                for (const header of Object.keys(forgedHeaders))
                    assert.equal(verifiedRequest.headers[header], undefined);
                assert.equal(verifiedRequest.headers.authorization, undefined);
            }
            assert.equal(
                (await request('/api/archive', { cookie: oidcCookie })).status,
                200,
            );
            const bytes = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yY9sAAAAASUVORK5CYII=',
                'base64',
            );
            const form = new FormData();
            form.set(
                'photo',
                new Blob([bytes], { type: 'image/png' }),
                'oidc-test.png',
            );
            const upload = await request('/api/images', {
                method: 'POST',
                body: form,
                cookie: oidcCookie,
            });
            assert.equal(upload.status, 200);
            const photo = await upload.json();
            const add = await request('/api/archive', {
                method: 'POST',
                cookie: oidcCookie,
                body: {
                    action: 'add',
                    item: {
                        name: 'OIDC test chair',
                        category: 'furniture',
                        owner: 'household',
                        imageId: photo.id,
                        photos: [
                            {
                                imageId: photo.id,
                                kind: 'product',
                                alt: 'Disposable test photo',
                            },
                        ],
                    },
                },
            });
            assert.equal(add.status, 200);
            const item = (await add.json()).result;
            const itemPage = await request('/pieces/' + item.id, {
                cookie: oidcCookie,
            });
            assert.equal(itemPage.status, 200);
            assert.match(await itemPage.text(), /OIDC test chair/);
            const image = await request('/api/images/' + photo.id, {
                cookie: oidcCookie,
            });
            assert.equal(image.status, 200);
            assert.equal(
                image.headers.get('cache-control'),
                'private, max-age=31536000',
            );
            const vary = image.headers.get('vary').toLowerCase().split(/,\s*/);
            assert.ok(vary.includes('cookie'));
            assert.ok(vary.includes('authorization'));
            assert.match(image.headers.get('content-type'), /^image\/png/);
            assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
            const anonymousImage = await request('/api/images/' + photo.id);
            assert.equal(anonymousImage.status, 401);
            assert.equal(
                anonymousImage.headers.get('cache-control'),
                'private, no-store',
            );
            const missingImage = await request('/api/images/missing-image', {
                cookie: oidcCookie,
            });
            assert.equal(missingImage.status, 404);
            assert.equal(
                missingImage.headers.get('cache-control'),
                'private, no-store',
            );
            const update = {
                action: 'update',
                ids: [item.id],
                patch: { notes: 'OIDC write' },
                expectedUpdatedAt: { [item.id]: item.updatedAt },
            };
            assert.equal(
                (
                    await request('/api/archive', {
                        method: 'POST',
                        cookie: oidcCookie,
                        body: update,
                        headers: { origin: 'https://evil.example' },
                    })
                ).status,
                403,
            );
            assert.equal(
                (
                    await request('/api/archive', {
                        method: 'POST',
                        cookie: oidcCookie,
                        body: update,
                        headers: { 'sec-fetch-site': 'cross-site' },
                    })
                ).status,
                403,
            );
            const updated = await request('/api/archive', {
                method: 'POST',
                cookie: oidcCookie,
                body: update,
            });
            assert.equal(updated.status, 200);
            assert.equal((await updated.json()).result[0].notes, 'OIDC write');
            for (const mode of [
                'missing-identity',
                'empty-identity',
                'rejected-with-identity',
                'redirect',
                'outage',
                'disconnect',
            ]) {
                verifierMode = mode;
                assert.equal(
                    (
                        await request('/api/archive', {
                            cookie: oidcCookie,
                            headers: forgedHeaders,
                        })
                    ).status,
                    401,
                    mode,
                );
                oidcRedirect(await request('/', { cookie: oidcCookie }), mode);
            }
            assert.equal(
                redirectedVerifierCalls,
                0,
                'The app must not follow verifier redirects',
            );
            // A provider outage does not revoke the independent API credential or grant it HTML access.
            verifierMode = 'outage';
            const schema = await request('/api/integration', {
                bearer: agentToken,
            });
            assert.equal(schema.status, 200);
            assert.equal((await schema.json()).version, 1);
            assert.equal(
                (await request('/api/archive', { bearer: agentToken })).status,
                200,
            );
            assert.equal(
                (
                    await request('/api/images/' + photo.id, {
                        bearer: agentToken,
                    })
                ).status,
                200,
            );
            oidcRedirect(
                await request('/', { bearer: agentToken }),
                'bearer browser request',
            );
            assert.equal(
                (await request('/api/archive', { bearer: 'incorrect-token' }))
                    .status,
                401,
            );
            const agentAdd = {
                action: 'add',
                requestId: 'oidc-production:agent:1',
                item: { name: 'Independent agent item', category: 'phone' },
            };
            const agentAdded = await request('/api/archive', {
                method: 'POST',
                bearer: agentToken,
                body: agentAdd,
            });
            assert.equal(agentAdded.status, 200);
            const agentId = (await agentAdded.json()).result.id;
            const retry = await request('/api/archive', {
                method: 'POST',
                bearer: agentToken,
                body: agentAdd,
            });
            assert.equal((await retry.json()).result.id, agentId);
            for (const action of [
                'import',
                'preferences',
                'save_outfit',
                'delete_outfit',
            ]) {
                assert.equal(
                    (
                        await request('/api/archive', {
                            method: 'POST',
                            bearer: agentToken,
                            body: { action },
                        })
                    ).status,
                    403,
                    action,
                );
            }
            verifierMode = 'normal';
            assert.equal(
                (
                    await request('/api/session', {
                        method: 'DELETE',
                        cookie: oidcCookie,
                        headers: { origin: 'https://evil.example' },
                    })
                ).status,
                403,
            );
            const logout = await request('/api/session', {
                method: 'DELETE',
                cookie: oidcCookie,
            });
            assert.equal(logout.status, 200);
            assert.deepEqual(await logout.json(), {
                ok: true,
                redirectTo: logoutUrl,
            });
            assert.match(
                logout.headers.get('set-cookie'),
                /^archive_session=;/,
            );
            assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
            assert.match(logout.headers.get('set-cookie'), /HttpOnly/);
            assert.match(logout.headers.get('set-cookie'), /Secure/);
            oidcRedirect(await request('/'), 'signed out browser');
        } finally {
            if (
                server &&
                server.exitCode === null &&
                server.signalCode === null
            ) {
                const exited = once(server, 'exit');
                server.kill('SIGTERM');
                await exited;
            }
            verifier.closeAllConnections();
            if (verifier.listening)
                await new Promise((done) => verifier.close(done));
            await rm(directory, { recursive: true, force: true });
        }
    },
);
