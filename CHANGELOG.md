# Changelog

All notable changes are recorded here. The project follows Semantic Versioning after 1.0.0.

## [1.0.0] - 2026-10-23

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
