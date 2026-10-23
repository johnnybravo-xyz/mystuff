# Data model and portable format

SQLite stores installation settings, the administrator credential, sessions, profiles, inventory items, purchase facts, images, groups, outfits, preferences, import batches, shop inquiries, and persistent rate-limit state. JSON item records retain feature-specific fields without requiring a wide table. Account and installation IDs remain explicit for future evolution, while v1 supports one household.

Images are content-addressed by database rows and stored under `/data/images`. Writes use a temporary file followed by an atomic rename.

Schema versions are ordered in `db/index.ts`. Each migration runs once in a transaction. A newer unknown schema is rejected before modification.

A portable archive is a gzip-compressed tar containing:

```text
manifest.json
archive.sqlite
images/...
```

`manifest.json` records `format: "mystuff-backup"`, format version, archive kind, creation time, SQLite schema version, and every payload file's path, byte size, and SHA-256. Restore rejects unsafe paths, unsupported formats, checksum differences, SQLite integrity errors, and schema/manifest disagreement.
