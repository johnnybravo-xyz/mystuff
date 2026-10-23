import { getDb } from '@/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getDb().prepare('SELECT 1').first();
    return Response.json(
      { status: 'ready' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'archive.readiness.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return Response.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
