import { getArchiveUser, sameOriginMutation } from '@/app/auth';
import { updateInstallation } from '@/app/installation';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  if (!sameOriginMutation(request))
    return Response.json({ error: 'Save settings from this My Stuff page.' }, { status: 403 });
  if (!(await getArchiveUser(request)))
    return Response.json({ error: 'Sign in to change settings.' }, { status: 401 });
  if (Number(request.headers.get('content-length') || 0) > 64 * 1024)
    return Response.json({ error: 'Settings are too large.' }, { status: 413 });
  try {
    const installation = await updateInstallation(await request.json());
    return Response.json(
      { ok: true, installation },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Settings could not be saved.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
