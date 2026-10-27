# Changelog

All notable changes are recorded here. The project follows Semantic Versioning. Before 1.0.0, minor releases may include breaking changes.

## [Unreleased]

### Changed

- The setup link is printed when the container starts and stays valid across restarts until setup completes. `mystuff setup-token` prints it again; `--rotate` still replaces it.
- The setup wizard checks the token on its first step and validates each step before continuing, including password confirmation, region values, profile labels, collections, and public shop prerequisites.
- The setup wizard replaces the informational first-item and backup steps with a review step. Demo items moved to Features. The wizard no longer shows shell commands or environment variable names; an expired or missing setup link gets a plain-language explanation.
- `npm run dev` prints the setup link at startup, `npm run setup-link` prints it again, and the `mystuff` CLI defaults to `./data` outside the container, matching the server.
- Headings use Fraunces and body text uses Nunito Sans for a softer look.

## [0.1.0] - 2026-10-23

### Added

- Browser first-run setup with a one-time claim, Argon2id administrator password, database sessions, and persistent login throttling.
- Configurable branding, locale, time zone, base currency, household profiles, collections, feature flags, and shop identity.
- Pantry and Pets collections, item-page Trash, public listing comments, and configurable asking currencies.
- Ordered schema migrations with verified bounded pre-migration snapshots.
- `mystuff` setup recovery, password reset, backup, verify, restore, portable export, and image audit commands.
- Non-root image, image-based Compose, health/readiness checks, amd64/arm64 release workflow, and self-hosting documentation.

### Changed

- Public shop is disabled by default and requires a configured HTTPS origin plus explicit exposure confirmation.
- Personal deployment and retailer-shortlist material was removed from the reusable project.
