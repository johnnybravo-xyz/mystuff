import {
  completeSetup,
  ensureSetupClaim,
  setupRequired,
  verifySetupToken,
} from '@/app/installation';
import { sameOriginMutation } from '@/app/auth';

export const dynamic = 'force-dynamic';

function response(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET() {
  const required = await setupRequired();
  if (required) await ensureSetupClaim();
  return response({ setupRequired: required });
}

export async function POST(request: Request) {
  if (!sameOriginMutation(request))
    return response({ error: 'Complete setup from this My Stuff page.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 32 * 1024)
    return response({ error: 'Setup details are too large.' }, 413);
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return response({ error: 'Send setup details as JSON.' }, 415);
  try {
    const body = (await request.json()) as {
      token?: unknown;
      setup?: unknown;
      verifyOnly?: unknown;
    };
    if (typeof body.token !== 'string' || body.token.length > 200)
      return response(
        { error: 'Enter the setup token from the container log.' },
        400,
      );
    if (!(await setupRequired()))
      return response({ error: 'Setup is already complete.' }, 409);
    if (!(await verifySetupToken(body.token))) {
      console.warn(
        JSON.stringify({
          event: 'installation.setup.rejected',
          reason: 'token_mismatch',
        }),
      );
      return response(
        { error: 'This setup link is invalid or has expired.' },
        401,
      );
    }
    if (body.verifyOnly === true) return response({ ok: true });
    await completeSetup(body.token, body.setup);
    return response({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Setup could not be completed.';
    const status = message === 'Setup is already complete.' ? 409 : 400;
    console.warn(
      JSON.stringify({ event: 'installation.setup.rejected', reason: message }),
    );
    return response({ error: message }, status);
  }
}
