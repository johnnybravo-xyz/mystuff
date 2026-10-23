import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
    authConfiguration,
    authMode,
    oidcConfiguration,
    signInDestination,
    signOutDestination,
    validAgentToken,
    passwordMatches,
    createSession,
    validSession,
    sessionFromCookie,
    sessionCookie,
    safeReturnPath,
    sameOriginMutation,
    takeLoginAttempt,
    localPreviewAllowed,
    getArchiveUser,
    SESSION_SECONDS,
} from '../app/auth.ts';

const config = {
    password: 'unit-test-only-password',
    secret: 'unit-test-only-secret-that-is-at-least-32-characters',
};
const now = 1788880000000;

function request(
    method = 'POST',
    body = { password: config.password },
    headers = {},
) {
    return new Request('https://wardrobe.example/api/session', {
        method,
        headers: {
            origin: 'https://wardrobe.example',
            'content-type': 'application/json',
            ...headers,
        },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
}

test('configuration rejects missing and short credentials', () => {
    assert.equal(authConfiguration({}).config, null);
    assert.equal(
        authConfiguration({
            ARCHIVE_PASSWORD: 'short',
            ARCHIVE_SESSION_SECRET: config.secret,
        }).config,
        null,
    );
    assert.equal(
        authConfiguration({
            ARCHIVE_PASSWORD: config.password,
            ARCHIVE_SESSION_SECRET: 'short',
        }).config,
        null,
    );
    assert.deepEqual(
        authConfiguration({
            ARCHIVE_PASSWORD: config.password,
            ARCHIVE_SESSION_SECRET: config.secret,
        }).config,
        config,
    );
    assert.equal(passwordMatches(config.password, config.password), true);
    assert.equal(passwordMatches('wrong', config.password), false);
});

test('copying example credentials cannot enable sign-in', () => {
    const example = Object.fromEntries(
        readFileSync(new URL('../.env.example', import.meta.url), 'utf8')
            .split('\n')
            .map((line) =>
                /^(ARCHIVE_PASSWORD|ARCHIVE_SESSION_SECRET)=(.*)$/.exec(line),
            )
            .filter(Boolean)
            .map((match) => [match[1], match[2]]),
    );
    assert.equal(authConfiguration(example).config, null);
    assert.equal(
        authConfiguration({
            ...example,
            ARCHIVE_SESSION_SECRET: config.secret,
        }).config,
        null,
    );
    assert.equal(
        authConfiguration({
            ...example,
            ARCHIVE_PASSWORD: config.password,
        }).config,
        null,
    );
});

test('signed sessions enforce expiry, signature, future issuance, and credential rotation', () => {
    const token = createSession(config, now);
    assert.equal(validSession(token, config, now), true);
    assert.equal(
        validSession(token, config, now + SESSION_SECONDS * 1000 - 1),
        true,
    );
    assert.equal(
        validSession(token, config, now + SESSION_SECONDS * 1000),
        false,
    );
    assert.equal(validSession(token, config, now - 1), false);
    assert.equal(
        validSession(
            token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'),
            config,
            now,
        ),
        false,
    );
    assert.equal(
        validSession(
            token,
            { ...config, secret: config.secret + 'changed' },
            now,
        ),
        false,
    );
    assert.equal(
        validSession(
            token,
            { ...config, password: config.password + 'changed' },
            now,
        ),
        false,
    );
    for (const malformed of [null, '', 'v1.0.x.x', 'x'.repeat(300)])
        assert.equal(validSession(malformed, config, now), false);
});

test('cookies are host-only, HttpOnly, same-site, expire on logout, and reject duplicates', () => {
    const cookie = sessionCookie('test-token', request());
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /; Secure$/);
    assert.match(cookie, /Max-Age=604800/);
    assert.doesNotMatch(cookie, /Domain=/);
    assert.match(sessionCookie('', request('DELETE')), /Max-Age=0/);
    assert.equal(sessionFromCookie('other=1; archive_session=valid'), 'valid');
    assert.equal(
        sessionFromCookie('archive_session=one; archive_session=two'),
        null,
    );
});

test('redirects stay within application paths', () => {
    for (const value of [
        '//evil.test',
        '/\\evil.test',
        'https://evil.test',
        '/signin',
        '/signin/',
        '/api/session',
        '/api',
        '/\nevil.test',
        null,
        ['/?x=1'],
    ])
        assert.equal(safeReturnPath(value), '/', String(value));
    assert.equal(
        safeReturnPath('/pieces/hm-123?owner=me#photos'),
        '/pieces/hm-123?owner=me#photos',
    );
});

test('mutations require a matching Origin and reject cross-site metadata', () => {
    assert.equal(sameOriginMutation(request()), true);
    assert.equal(
        sameOriginMutation(
            request('POST', {}, { origin: 'https://evil.test' }),
        ),
        false,
    );
    assert.equal(
        sameOriginMutation(
            request('POST', {}, { 'sec-fetch-site': 'cross-site' }),
        ),
        false,
    );
    assert.equal(
        sameOriginMutation(
            new Request('https://wardrobe.example/api/session', {
                method: 'POST',
            }),
        ),
        false,
    );
});

test('development preview is explicitly enabled and limited to local hostnames', () => {
    const development = { NODE_ENV: 'development', ARCHIVE_LOCAL_PREVIEW: '1' };
    assert.equal(localPreviewAllowed('localhost', development), true);
    assert.equal(localPreviewAllowed('127.0.0.1', development), true);
    for (const host of ['wardrobe.example', 'localhost.evil.test', '0.0.0.0'])
        assert.equal(localPreviewAllowed(host, development), false);
    assert.equal(
        localPreviewAllowed('localhost', {
            ...development,
            NODE_ENV: 'production',
        }),
        false,
    );
    assert.equal(
        localPreviewAllowed('localhost', { NODE_ENV: 'development' }),
        false,
    );
});

test('shared login limit permits ten attempts and resets only after its window', () => {
    const state = { startedAt: now, attempts: 0 };
    for (let i = 0; i < 10; i++) assert.equal(takeLoginAttempt(state, now), 0);
    assert.equal(takeLoginAttempt(state, now), 900);
    assert.equal(takeLoginAttempt(state, now + 899000), 1);
    assert.equal(takeLoginAttempt(state, now + 900000), 0);
});

test('production identity requires a signed session and ignores client identity headers', async () => {
    const keys = [
        'NODE_ENV',
        'ARCHIVE_LOCAL_PREVIEW',
        'ARCHIVE_PASSWORD',
        'ARCHIVE_SESSION_SECRET',
        'ARCHIVE_AUTH_MODE',
    ];
    const previous = Object.fromEntries(
        keys.map((key) => [key, process.env[key]]),
    );
    try {
        process.env.NODE_ENV = 'production';
        process.env.ARCHIVE_LOCAL_PREVIEW = '1';
        process.env.ARCHIVE_PASSWORD = config.password;
        process.env.ARCHIVE_SESSION_SECRET = config.secret;
        process.env.ARCHIVE_AUTH_MODE = 'password';
        const cookie = sessionCookie(createSession(config), request()).split(
            ';',
        )[0];
        const user = await getArchiveUser(
            new Request('https://wardrobe.example/', { headers: { cookie } }),
        );
        assert.equal(user.userId, 'owner');
        assert.equal(
            await getArchiveUser(
                new Request('http://localhost/', {
                    headers: {
                        'oai-authenticated-user-id': 'owner',
                        'oai-authenticated-user-email': 'forged@example.test',
                        'x-forwarded-for': '127.0.0.1',
                    },
                }),
            ),
            null,
        );
        process.env.ARCHIVE_PASSWORD = config.password + '-rotated';
        assert.equal(
            await getArchiveUser(
                new Request('https://wardrobe.example/', {
                    headers: { cookie },
                }),
            ),
            null,
        );
    } finally {
        for (const key of keys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    }
});

test('integration tokens are disabled by default and can be independently revoked', () => {
    const token = 'unit_test_only_integration_token_1234567890';
    const config = {
        ARCHIVE_AGENT_TOKEN_SHA256: createHash('sha256')
            .update(token)
            .digest('hex'),
    };
    const req = new Request('https://inventory.example/api/archive', {
        headers: { authorization: 'Bearer ' + token },
    });
    assert.equal(validAgentToken(req, {}), false);
    assert.equal(validAgentToken(req, config), true);
    assert.equal(
        validAgentToken(req, { ARCHIVE_AGENT_TOKEN_SHA256: '0'.repeat(64) }),
        false,
    );
    for (const authorization of [
        'Basic ' + token,
        'Bearer short',
        'Bearer ' + token + 'x',
    ])
        assert.equal(
            validAgentToken(
                new Request(req.url, { headers: { authorization } }),
                config,
            ),
            false,
        );
});

function oidcEnvironment(authUrl = 'http://127.0.0.1:4180/oauth2/auth') {
    return {
        NODE_ENV: 'production',
        ARCHIVE_AUTH_MODE: 'oidc',
        ARCHIVE_OIDC_AUTH_URL: authUrl,
        ARCHIVE_OIDC_LOGIN_URL: 'https://auth.example/oauth2/start',
        ARCHIVE_OIDC_LOGOUT_URL:
            'https://auth.example/oauth2/sign_out?rd=https%3A%2F%2Fid.example%2Fend-session',
        ARCHIVE_PUBLIC_URL: 'https://inventory.example',
        ARCHIVE_PASSWORD: config.password,
        ARCHIVE_SESSION_SECRET: config.secret,
    };
}

async function authProvider(t, handler) {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(
        () =>
            new Promise((resolve) => {
                server.closeAllConnections();
                server.close(resolve);
            }),
    );
    return `http://127.0.0.1:${server.address().port}/oauth2/auth`;
}

test('OIDC configuration requires explicit valid endpoints and a canonical HTTPS app origin', () => {
    assert.equal(authMode({}), 'password');
    assert.equal(authMode({ ARCHIVE_AUTH_MODE: 'oidc' }), 'oidc');
    assert.equal(authMode({ ARCHIVE_AUTH_MODE: 'misspelled' }), 'invalid');
    assert(oidcConfiguration(oidcEnvironment()).config);
    for (const [key, value] of [
        ['ARCHIVE_OIDC_AUTH_URL', 'file:///tmp/auth'],
        ['ARCHIVE_OIDC_AUTH_URL', 'http://user:password@proxy/oauth2/auth'],
        ['ARCHIVE_OIDC_LOGIN_URL', 'http://auth.example/oauth2/start'],
        ['ARCHIVE_OIDC_LOGOUT_URL', 'javascript:alert(1)'],
        ['ARCHIVE_PUBLIC_URL', 'http://inventory.example'],
        ['ARCHIVE_PUBLIC_URL', 'https://inventory.example/path'],
        ['ARCHIVE_PUBLIC_URL', 'https://inventory.example/?override=1'],
    ])
        assert.equal(
            oidcConfiguration({ ...oidcEnvironment(), [key]: value }).config,
            null,
            key,
        );
    for (const key of [
        'ARCHIVE_OIDC_AUTH_URL',
        'ARCHIVE_OIDC_LOGIN_URL',
        'ARCHIVE_OIDC_LOGOUT_URL',
        'ARCHIVE_PUBLIC_URL',
    ])
        assert.equal(
            oidcConfiguration({ ...oidcEnvironment(), [key]: '' }).config,
            null,
            key,
        );
});

test('OIDC login uses the configured app origin and safe return paths; logout keeps its configured chain', () => {
    const env = oidcEnvironment();
    const login = new URL(
        signInDestination('/pieces/test?owner=me#photos', env),
    );
    assert.equal(login.origin + login.pathname, env.ARCHIVE_OIDC_LOGIN_URL);
    assert.equal(
        login.searchParams.get('rd'),
        'https://inventory.example/pieces/test?owner=me#photos',
    );
    for (const target of [
        'https://evil.example',
        '//evil.example',
        '/\\evil.example',
        '/signin',
        '/api/session',
    ])
        assert.equal(
            new URL(signInDestination(target, env)).searchParams.get('rd'),
            'https://inventory.example/',
        );
    assert.equal(signOutDestination(env), env.ARCHIVE_OIDC_LOGOUT_URL);
    assert.equal(signOutDestination({}), '/signin');
    assert.equal(
        signInDestination('/pieces/test', {}),
        '/signin?return_to=%2Fpieces%2Ftest',
    );
});

test('OIDC validates the cookie at the provider and never trusts identity headers or a legacy password cookie', async (t) => {
    const received = [];
    const endpoint = await authProvider(t, (req, res) => {
        received.push({
            method: req.method,
            path: req.url,
            headers: req.headers,
        });
        if (req.headers.cookie === 'oidc_test=valid') {
            res.writeHead(202, {
                'X-Auth-Request-User': 'provider-validated-user',
            });
        } else res.writeHead(401);
        res.end();
    });
    const env = oidcEnvironment(endpoint);
    const forgedHeaders = {
        'x-auth-request-user': 'forged-owner',
        'x-auth-request-email': 'forged@example.test',
        'x-forwarded-user': 'forged-owner',
        'x-forwarded-host': 'evil.example',
        authorization: 'Bearer unit_test_token_that_must_not_be_forwarded',
    };
    const authenticated = await getArchiveUser(
        new Request('https://inventory.example/', {
            headers: { ...forgedHeaders, cookie: 'oidc_test=valid' },
        }),
        env,
    );
    assert.equal(authenticated.userId, 'owner');
    assert.equal(received[0].method, 'GET');
    assert.equal(received[0].path, '/oauth2/auth');
    assert.equal(received[0].headers.cookie, 'oidc_test=valid');
    for (const key of Object.keys(forgedHeaders))
        assert.equal(received[0].headers[key], undefined, key);
    assert.equal(
        await getArchiveUser(
            new Request('https://inventory.example/', {
                headers: forgedHeaders,
            }),
            env,
        ),
        null,
    );
    assert.equal(
        received.length,
        1,
        'No-cookie requests do not call the provider',
    );
    assert.equal(
        await getArchiveUser(
            new Request('https://inventory.example/', {
                headers: {
                    ...forgedHeaders,
                    cookie: `archive_session=${createSession(config)}`,
                },
            }),
            env,
        ),
        null,
    );
    assert.equal(
        await getArchiveUser(
            new Request('https://inventory.example/', {
                headers: { ...forgedHeaders, cookie: 'oidc_test=invalid' },
            }),
            env,
        ),
        null,
    );
    assert.equal(
        await getArchiveUser(new Request('http://localhost/'), {
            ...env,
            NODE_ENV: 'development',
            ARCHIVE_LOCAL_PREVIEW: '1',
        }),
        null,
    );
});

test('OIDC rejects redirects, errors, and successful responses without a nonempty provider identity', async (t) => {
    const paths = [];
    const endpoint = await authProvider(t, (req, res) => {
        paths.push(req.url);
        if (req.url === '/would-accept') {
            res.writeHead(202, { 'x-auth-request-user': 'owner' });
        } else if (req.headers.cookie === 'case=redirect') {
            res.writeHead(302, {
                location: '/would-accept',
                'x-auth-request-user': 'owner',
            });
        } else if (req.headers.cookie === 'case=error') {
            res.writeHead(500, { 'x-auth-request-user': 'owner' });
        } else if (req.headers.cookie === 'case=denied') {
            res.writeHead(401, { 'x-auth-request-user': 'owner' });
        } else if (req.headers.cookie === 'case=blank') {
            res.writeHead(202, { 'x-auth-request-user': '   ' });
        } else res.writeHead(200);
        res.end();
    });
    for (const outcome of ['redirect', 'error', 'denied', 'blank', 'missing'])
        assert.equal(
            await getArchiveUser(
                new Request('https://inventory.example/', {
                    headers: { cookie: `case=${outcome}` },
                }),
                oidcEnvironment(endpoint),
            ),
            null,
            outcome,
        );
    assert.equal(paths.length, 5);
    assert(
        paths.every((path) => path === '/oauth2/auth'),
        'Provider redirects must not be followed',
    );
});

test('OIDC provider failures and timeouts fail closed within the request deadline', async (t) => {
    const endpoint = await authProvider(t, (req, res) => {
        if (req.headers.cookie === 'case=disconnect') res.destroy();
        // The timeout case deliberately never sends response headers.
    });
    const env = oidcEnvironment(endpoint);
    assert.equal(
        await getArchiveUser(
            new Request('https://inventory.example/', {
                headers: { cookie: 'case=disconnect' },
            }),
            env,
        ),
        null,
    );
    const startedAt = Date.now();
    assert.equal(
        await getArchiveUser(
            new Request('https://inventory.example/', {
                headers: { cookie: 'case=timeout' },
            }),
            env,
        ),
        null,
    );
    const elapsed = Date.now() - startedAt;
    assert(
        elapsed >= 2500 && elapsed < 6000,
        `Verification took ${elapsed} ms`,
    );
    const passwordCookie = new Request('https://inventory.example/', {
        headers: { cookie: `archive_session=${createSession(config)}` },
    });
    assert.equal(
        await getArchiveUser(passwordCookie, {
            ...env,
            ARCHIVE_OIDC_AUTH_URL: '',
        }),
        null,
    );
    assert.equal(
        await getArchiveUser(passwordCookie, {
            ...env,
            ARCHIVE_AUTH_MODE: 'invalid',
        }),
        null,
    );
});
