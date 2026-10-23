export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    {
      status: 'ok',
      version:
        process.env.MYSTUFF_VERSION ||
        process.env.npm_package_version ||
        'development',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
