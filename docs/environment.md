# Environment reference

A fresh built-in-login installation needs no secret environment variables.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ARCHIVE_DATA_DIR` | `/data` in the container | Database, images, session key, and migration backups. |
| `HOST` | `0.0.0.0` | Listen address in the container. |
| `PORT` | `3000` | HTTP listen port. |
| `MYSTUFF_PUBLIC_URL` | unset | Canonical HTTPS origin required to enable the public shop. |
| `VINEXT_TRUSTED_HOSTS` | unset | Forwarded hostnames accepted by the server. |
| `ARCHIVE_SESSION_SECRET` | generated in `/data/secrets/session.key` | Optional secret-manager override, at least 32 characters. |
| `ARCHIVE_AGENT_TOKEN_SHA256` | unset | SHA-256 digest for the optional inventory API bearer token. |
| `ARCHIVE_AUTH_MODE` | `password` | `password` for built-in login or `oidc` for advanced forward-auth compatibility. |
| `ARCHIVE_PUBLIC_URL` | unset | Legacy canonical origin and required public origin in OIDC mode. |
| `ARCHIVE_OIDC_AUTH_URL` | unset | Private endpoint used to validate the proxy session cookie. |
| `ARCHIVE_OIDC_LOGIN_URL` | unset | HTTPS login start URL. |
| `ARCHIVE_OIDC_LOGOUT_URL` | unset | HTTPS logout URL. |
| `ARCHIVE_LOCAL_PREVIEW` | unset | Development-only loopback login bypass. Never set in production. |

Legacy `ARCHIVE_PASSWORD` and `ARCHIVE_SESSION_SECRET` authentication remains available for existing installations. New installations should use browser setup and the generated session key. Environment variables do not reopen completed setup.
