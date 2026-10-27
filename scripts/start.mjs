#!/usr/bin/env node
// Container entry point. Starts the standalone server, then makes one local
// request: production vinext runs instrumentation.ts on the first request, so
// this makes migrations run and the setup link print at boot rather than on
// the first browser visit. Expects to run as /app/scripts/start.mjs.
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const attempts = 30;

await import('../server.js');

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/health`);
    break;
  } catch (error) {
    if (attempt === attempts)
      console.warn(
        JSON.stringify({
          event: 'archive.startup.warmup_failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    else await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
