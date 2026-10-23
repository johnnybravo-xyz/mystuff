import {
    createHash,
    createHmac,
    randomBytes,
    timingSafeEqual,
} from 'node:crypto';
// Keep the canonical redirect static: production builds mangle dynamic next/navigation exports.
import { redirect } from 'vinext/shims/navigation-errors';

export const SESSION_COOKIE = 'archive_session';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export type ArchiveUser = { userId: string; displayName: string };
export type AuthConfig = { password: string; secret: string };
export type LoginWindow = { startedAt: number; attempts: number };
export type OidcConfig = {
    authUrl: string;
    loginUrl: string;
    logoutUrl: string;
    publicUrl: string;
};

export function authMode(
    env: NodeJS.ProcessEnv = process.env,
): 'password' | 'oidc' | 'invalid' {
    const mode = env.ARCHIVE_AUTH_MODE || 'password';
    return mode === 'password' || mode === 'oidc' ? mode : 'invalid';
}

export function oidcConfiguration(
    env: NodeJS.ProcessEnv = process.env,
): { config: OidcConfig; error: null } | { config: null; error: string } {
    try {
        const authUrl = new URL(env.ARCHIVE_OIDC_AUTH_URL || '');
        const loginUrl = new URL(env.ARCHIVE_OIDC_LOGIN_URL || '');
        const logoutUrl = new URL(env.ARCHIVE_OIDC_LOGOUT_URL || '');
        const publicUrl = new URL(env.ARCHIVE_PUBLIC_URL || '');
        if (
            !['http:', 'https:'].includes(authUrl.protocol) ||
            [loginUrl, logoutUrl, publicUrl].some(
                (url) => url.protocol !== 'https:',
            ) ||
            [authUrl, loginUrl, logoutUrl, publicUrl].some(
                (url) => url.username || url.password || url.hash,
            ) ||
            publicUrl.pathname !== '/' ||
            publicUrl.search
        )
            throw new Error('Invalid OIDC configuration');
        return {
            config: {
                authUrl: authUrl.href,
                loginUrl: loginUrl.href,
                logoutUrl: logoutUrl.href,
                publicUrl: publicUrl.origin,
            },
            error: null,
        };
    } catch {
        return {
            config: null,
            error: 'Single sign-on is not configured. Check ARCHIVE_OIDC_AUTH_URL, ARCHIVE_OIDC_LOGIN_URL, ARCHIVE_OIDC_LOGOUT_URL, and the HTTPS ARCHIVE_PUBLIC_URL on the server.',
        };
    }
}

export function signInDestination(
    returnTo: string,
    env: NodeJS.ProcessEnv = process.env,
): string {
    const path = safeReturnPath(returnTo);
    if (authMode(env) === 'oidc') {
        const { config } = oidcConfiguration(env);
        if (config) {
            const destination = new URL(config.loginUrl);
            destination.searchParams.set(
                'rd',
                new URL(path, config.publicUrl).href,
            );
            return destination.href;
        }
    }
    return `/signin?return_to=${encodeURIComponent(path)}`;
}

export function signOutDestination(
    env: NodeJS.ProcessEnv = process.env,
): string {
    return authMode(env) === 'oidc'
        ? oidcConfiguration(env).config?.logoutUrl || '/signin'
        : '/signin';
}

async function oidcUser(
    cookie: string | null,
    env: NodeJS.ProcessEnv,
): Promise<ArchiveUser | null> {
    const { config } = oidcConfiguration(env);
    if (!config || !cookie?.trim()) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
        // Identity headers from the browser are untrusted; the provider validates its own cookie.
        const response = await fetch(config.authUrl, {
            method: 'GET',
            headers: { cookie },
            redirect: 'manual',
            cache: 'no-store',
            signal: controller.signal,
        });
        if (
            !response.ok ||
            !response.headers.get('x-auth-request-user')?.trim()
        )
            return null;
        return { userId: 'owner', displayName: 'Owner' };
    } catch {
        console.warn(
            JSON.stringify({
                event: 'archive.oidc',
                outcome: 'verification_unavailable',
            }),
        );
        return null;
    } finally {
        clearTimeout(timeout);
        controller.abort();
    }
}

export function validAgentToken(
    request: Request,
    env: NodeJS.ProcessEnv = process.env,
): boolean {
    const expected = env.ARCHIVE_AGENT_TOKEN_SHA256 || '';
    const supplied = /^Bearer ([A-Za-z0-9_-]{32,200})$/.exec(
        request.headers.get('authorization') || '',
    );
    if (!supplied || !/^[a-f0-9]{64}$/.test(expected)) return false;
    const digest = createHash('sha256').update(supplied[1]).digest();
    return timingSafeEqual(digest, Buffer.from(expected, 'hex'));
}

export function authConfiguration(
    env: NodeJS.ProcessEnv = process.env,
): { config: AuthConfig; error: null } | { config: null; error: string } {
    const password = env.ARCHIVE_PASSWORD || '';
    const secret = env.ARCHIVE_SESSION_SECRET || '';
    const exampleCredentials = [
        'replace-with-a-unique-password-at-least-12-characters',
        'replace-with-a-random-secret-at-least-32-characters',
    ];
    if (
        exampleCredentials.includes(password.trim()) ||
        exampleCredentials.includes(secret.trim())
    )
        return {
            config: null,
            error: 'Sign-in is not configured. Replace the example ARCHIVE_PASSWORD and ARCHIVE_SESSION_SECRET values with your own private credentials.',
        };
    if (password.length < 12 || secret.length < 32)
        return {
            config: null,
            error: 'Sign-in is not configured. Set ARCHIVE_PASSWORD to at least 12 characters and ARCHIVE_SESSION_SECRET to at least 32 characters on the server.',
        };
    return { config: { password, secret }, error: null };
}

export function passwordMatches(value: string, expected: string): boolean {
    const digest = (input: string) =>
        createHash('sha256').update(input).digest();
    return timingSafeEqual(digest(value), digest(expected));
}

function sessionSignature(payload: string, config: AuthConfig): string {
    // Password or secret rotation invalidates existing sessions.
    return createHmac('sha256', config.secret)
        .update('archive-session\0')
        .update(config.password)
        .update('\0')
        .update(payload)
        .digest('hex');
}

export function createSession(config: AuthConfig, now = Date.now()): string {
    const payload = `v1.${now}.${randomBytes(18).toString('base64url')}`;
    return `${payload}.${sessionSignature(payload, config)}`;
}

export function validSession(
    token: string | null,
    config: AuthConfig,
    now = Date.now(),
): boolean {
    if (!token || token.length > 200) return false;
    const match = /^(v1\.(\d{13})\.[A-Za-z0-9_-]{24})\.([a-f0-9]{64})$/.exec(
        token,
    );
    if (!match) return false;
    const issuedAt = Number(match[2]);
    if (issuedAt > now || now - issuedAt >= SESSION_SECONDS * 1000)
        return false;
    return timingSafeEqual(
        Buffer.from(match[3], 'hex'),
        Buffer.from(sessionSignature(match[1], config), 'hex'),
    );
}

export function sessionFromCookie(value: string | null): string | null {
    if (!value) return null;
    const matches = value
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.startsWith(`${SESSION_COOKIE}=`));
    return matches.length === 1
        ? matches[0].slice(SESSION_COOKIE.length + 1)
        : null;
}

export function sessionCookie(token: string, request: Request): string {
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure}`;
}

export function safeReturnPath(value: unknown): string {
    if (
        typeof value !== 'string' ||
        !value.startsWith('/') ||
        value.startsWith('//') ||
        value.includes('\\') ||
        value
            .split('')
            .some(
                (character) =>
                    character.charCodeAt(0) <= 32 ||
                    character.charCodeAt(0) === 127,
            )
    )
        return '/';
    try {
        const url = new URL(value, 'https://archive.local');
        if (
            url.origin !== 'https://archive.local' ||
            url.pathname.replace(/\/+$/, '') === '/signin' ||
            url.pathname === '/api' ||
            url.pathname.startsWith('/api/')
        )
            return '/';
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return '/';
    }
}

export function sameOriginMutation(request: Request): boolean {
    return (
        request.headers.get('origin') === new URL(request.url).origin &&
        request.headers.get('sec-fetch-site') !== 'cross-site'
    );
}

export function takeLoginAttempt(
    window: LoginWindow,
    now = Date.now(),
): number {
    const duration = 15 * 60 * 1000;
    if (now - window.startedAt >= duration || now < window.startedAt) {
        window.startedAt = now;
        window.attempts = 0;
    }
    if (window.attempts >= 10)
        return Math.max(
            1,
            Math.ceil((window.startedAt + duration - now) / 1000),
        );
    window.attempts += 1;
    return 0;
}

export function localPreviewAllowed(
    hostname: string,
    env: NodeJS.ProcessEnv = process.env,
): boolean {
    return (
        env.NODE_ENV === 'development' &&
        env.ARCHIVE_LOCAL_PREVIEW === '1' &&
        (hostname === 'localhost' || hostname === '127.0.0.1')
    );
}

export async function getArchiveUser(
    request?: Request,
    env: NodeJS.ProcessEnv = process.env,
): Promise<ArchiveUser | null> {
    const requestHeaders =
        request?.headers || (await (await import('next/headers')).headers());
    const mode = authMode(env);
    if (mode === 'oidc') return oidcUser(requestHeaders.get('cookie'), env);
    if (mode !== 'password') return null;
    let hostname = '';
    try {
        hostname = new URL(
            request?.url || `http://${requestHeaders.get('host') || ''}`,
        ).hostname;
    } catch {
        // An invalid host never enables the local preview shortcut.
    }
    if (localPreviewAllowed(hostname, env))
        return { userId: 'owner', displayName: 'Owner' };
    const { config } = authConfiguration(env);
    const token = sessionFromCookie(requestHeaders.get('cookie'));
    if (config)
        return validSession(token, config)
            ? { userId: 'owner', displayName: 'Owner' }
            : null;
    try {
        const { databaseSession } = await import('./installation');
        const user = databaseSession(token);
        return user
            ? { userId: user.account_id, displayName: user.display_name }
            : null;
    } catch (error) {
        console.error(
            JSON.stringify({
                event: 'archive.session.failed',
                error: error instanceof Error ? error.message : String(error),
            }),
        );
        return null;
    }
}

export async function requireArchiveUser(
    returnTo: string,
): Promise<ArchiveUser> {
    const user = await getArchiveUser();
    if (user) return user;
    if (authMode() === 'password' && !authConfiguration().config) {
        const { setupRequired } = await import('./installation');
        if (await setupRequired()) return redirect('/setup');
    }
    return redirect(signInDestination(returnTo));
}
