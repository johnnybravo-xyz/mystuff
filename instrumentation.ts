// Prints the setup link as soon as the server starts while setup is pending.
// vinext calls register() at startup in development and on the first request
// in production, which scripts/start.mjs makes right after boot.
export async function register() {
  try {
    const { ensureSetupClaim } = await import('./app/installation');
    await ensureSetupClaim();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'installation.setup.startup_failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
