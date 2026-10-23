import {
    authConfiguration,
    authMode,
    createSession,
    passwordMatches,
    sameOriginMutation,
    sessionCookie,
    sessionFromCookie,
    signOutDestination,
    takeLoginAttempt,
} from '@/app/auth';

export const dynamic = 'force-dynamic';
// Legacy environment authentication keeps its in-memory limiter for compatibility.
const loginWindow = { startedAt: Date.now(), attempts: 0 };

function response(
    body: { error?: string | null; ok?: boolean; redirectTo?: string },
    status = 200,
    headers: Record<string, string> = {},
) {
    return Response.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store', ...headers },
    });
}

async function readPassword(request: Request): Promise<string | null> {
    if (
        request.headers.get('content-type')?.split(';')[0].trim() !==
        'application/json'
    )
        return null;
    const reader = request.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 4096) {
                await reader.cancel();
                return null;
            }
            chunks.push(value);
        }
        const body: unknown = JSON.parse(
            Buffer.concat(chunks).toString('utf8'),
        );
        if (!body || typeof body !== 'object' || !('password' in body))
            return null;
        return typeof body.password === 'string' && body.password.length <= 1024
            ? body.password
            : null;
    } catch {
        return null;
    } finally {
        reader.releaseLock();
    }
}

export async function POST(request: Request) {
    if (!sameOriginMutation(request))
        return response({ error: 'Sign in from your archive page.' }, 403);
    if (authMode() !== 'password')
        return response(
            {
                error: 'Password sign-in is disabled. Use single sign-on to open My Stuff.',
            },
            403,
        );
    const { config } = authConfiguration();
    const databaseAuth = !config ? await import('@/app/installation') : null;
    const retryAfter = config
        ? takeLoginAttempt(loginWindow)
        : databaseAuth!.persistentLoginAttempt();
    if (retryAfter)
        return response(
            {
                error: 'Too many sign-in attempts. Please try again in a few minutes.',
            },
            429,
            { 'Retry-After': String(retryAfter) },
        );
    const password = await readPassword(request);
    const user =
        password === null || config
            ? null
            : await databaseAuth!.authenticateAdministrator(password);
    if (
        password === null ||
        (config ? !passwordMatches(password, config.password) : !user)
    ) {
        console.warn(
            JSON.stringify({ event: 'archive.signin', outcome: 'rejected' }),
        );
        return response({ error: 'The password is incorrect.' }, 401);
    }
    if (!config) databaseAuth!.clearPersistentLoginAttempts();
    console.info(
        JSON.stringify({ event: 'archive.signin', outcome: 'accepted' }),
    );
    const token = config
        ? createSession(config)
        : databaseAuth!.createDatabaseSession(user!);
    return response({ ok: true }, 200, {
        'Set-Cookie': sessionCookie(token, request),
    });
}

export async function DELETE(request: Request) {
    if (!sameOriginMutation(request))
        return response({ error: 'Sign out from your archive page.' }, 403);
    if (!authConfiguration().config) {
        const { deleteDatabaseSession } = await import('@/app/installation');
        deleteDatabaseSession(sessionFromCookie(request.headers.get('cookie')));
    }
    return response({ ok: true, redirectTo: signOutDestination() }, 200, {
        'Set-Cookie': sessionCookie('', request),
    });
}
