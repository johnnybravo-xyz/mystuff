# Upgrades and rollback

Pin releases in `MYSTUFF_IMAGE`; for strict reproducibility use the published digest.

```sh
docker compose exec app mystuff backup /data/backups/pre-upgrade.tar.gz
docker compose exec app mystuff restore --verify /data/backups/pre-upgrade.tar.gz
docker compose pull
docker compose up -d
docker compose ps
```

Migrations are ordered, immutable, transactional, and recorded with SQLite `user_version`. Startup rejects a database newer than the application without modifying it. Existing databases receive a validated, bounded pre-migration SQLite snapshot.

Rolling application code back is safe only when the older release supports the current schema. Otherwise stop the app and restore the full pre-upgrade backup into a new or explicitly replaced volume, then start the matching older image. Never copy a live WAL database file as a rollback strategy.
