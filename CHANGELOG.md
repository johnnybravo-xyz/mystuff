# Changelog

All notable changes are recorded here. The project follows Semantic Versioning. Before 1.0.0, minor releases may include breaking changes.

## Unreleased

- Added a source-complete post-build `test` container stage that restores files
  pruned by the build while retaining production artifacts for isolated checks.

## [0.1.0] - 2026-10-27

First release.

- Browser setup wizard covering administrator, region, household profiles, collections, and features, with a final review. Each step is validated before continuing, and nothing is saved until the review is confirmed.
- Setup link printed when the container starts and valid across restarts until setup completes. `mystuff setup-token` prints it again; `--rotate` replaces it.
- Built-in Argon2id administrator login, database sessions, persistent login throttling, and CSRF checks.
- Configurable branding, locale, time zone, base currency, household profiles, collections, feature flags, and shop identity.
- Fashion, Home, Technology, Watches, Vehicles, Spirits, Pantry, Pets, Kids, and Other collections, with groups, wishlist, Trash, and optional demo items.
- Optional public shop with buyer comments and configurable asking currencies. Disabled by default; requires a public HTTPS origin and explicit exposure confirmation.
- Ordered schema migrations with verified bounded pre-migration snapshots.
- `mystuff` CLI for setup links, password reset, backup, verify, restore, portable export, and image audit.
- Non-root image for linux/amd64 and linux/arm64, image-based Compose, health and readiness checks, and self-hosting documentation.
- Development with Bun 1.4.3 for packages and scripts on Node 24. `bun run dev` prints the setup link at startup and shares `./data` with the CLI.
