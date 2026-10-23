# Backup, restore, and disaster recovery

## Create and verify

```sh
docker compose exec app mystuff backup /data/backups/my-stuff-$(date +%F).tar.gz
docker compose exec app mystuff restore --verify /data/backups/my-stuff-$(date +%F).tar.gz
```

The command uses SQLite's online backup API, copies the image tree, and writes a versioned manifest with sizes and SHA-256 checksums. Keep the resulting file on separate storage. A portable full export uses the same recoverable format:

```sh
docker compose exec app mystuff export /data/backups/portable.tar.gz
```

Readable collection exports in the UI are for people; they cannot restore an installation.

## Restore

Stop the app that owns the target volume. Restore into an empty `/data` directory:

```sh
docker compose run --rm app mystuff restore --verify /data/backups/my-stuff.tar.gz
docker compose run --rm app mystuff restore /data/backups/my-stuff.tar.gz
docker compose up -d
```

A non-empty target is rejected. To replace an existing database and images, preserve the old volume first and state intent explicitly:

```sh
docker compose run --rm app mystuff restore --replace /data/backups/my-stuff.tar.gz
```

Restore preserves the administrator password hash and inventory. It does not restore `/data/secrets/session.key`, so existing browser sessions are signed out when restoring into a new volume.

## Image audit

```sh
docker compose exec app mystuff images audit
```

Exit 0 means every image row has a file and every file has a row. Exit 2 reports missing and unreferenced paths. The command never deletes data.

## Migration snapshots

Before upgrading an existing schema, My Stuff writes a validated SQLite snapshot under `/data/migration-backups` and retains the latest three. These snapshots cover the database only. Use a full backup when image compatibility or application rollback matters.
