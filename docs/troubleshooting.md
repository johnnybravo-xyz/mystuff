# Troubleshooting

## Setup URL is missing

```sh
docker compose exec app mystuff setup-token
```

The link is also logged on every container start (`docker compose logs app | grep setup.ready`). Both work only before setup completes.

## "This setup token is not current"

The link belongs to an older installation, usually because the `/data` volume was deleted or recreated, or because the token was rotated. Print the current link with `mystuff setup-token` and open it in place of the old tab. Use `mystuff setup-token --rotate` only to invalidate a link that may have leaked.

## Permission denied under `/data`

The container runs as UID/GID 1000. Prefer the named volume. For a bind mount, stop the app and make the directory writable by 1000:1000.

## Health and readiness

`/api/health` should return 200 whenever the HTTP process is alive. `/api/ready` returns 503 when the database cannot open or migrate. Inspect `docker compose logs app` for structured `archive.*` events.

## Forgot the password

```sh
docker compose exec app mystuff password reset
```

For non-interactive automation, pipe the password and add `--password-stdin`; do not place it in a command argument or environment variable. Reset signs out existing sessions and does not change inventory.

## Migration failure

Keep the failed volume unchanged. My Stuff writes validated database-only snapshots under `/data/migration-backups` before schema changes. Prefer restoring a verified full backup with the matching application image.

## Missing photos

Run `docker compose exec app mystuff images audit`. Missing rows/files are reported without deletion. Restore the matching backup rather than inventing database rows or copying unrelated images.

## Redirect or secure-cookie problems

Confirm the proxy preserves host and scheme, `MYSTUFF_PUBLIC_URL` is the external HTTPS origin, and `VINEXT_TRUSTED_HOSTS` includes the forwarded hostname. Do not expose the container's port publicly as a workaround.
