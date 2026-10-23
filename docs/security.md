# Security model

My Stuff protects a private household inventory that may reveal possessions, prices, locations, buyer contact details, and photos. The supported internet-facing deployment uses HTTPS and application authentication. A trusted LAN deployment may use loopback or private HTTP.

Security boundaries:

- A single administrator controls one household installation.
- Household profiles are labels, not security principals.
- `/data` and backups are sensitive and must be protected by host permissions and encrypted off-host storage.
- The public shop exposes only fields and selected photos in its explicit projection.
- Product URL imports treat the remote site as hostile: DNS and every redirect are validated and pinned, private/reserved networks are rejected, credentials are not forwarded, and response type, size, and time are bounded.
- Uploads enforce limits and image signatures and are served with `nosniff`.
- Login attempts, setup, writes, and public inquiries are throttled or origin checked. Logs record operation metadata rather than item contents or credentials.

Private images use a browser-private cache and must never enter a shared CDN cache. Shop images use `no-store` to preserve immediate withdrawal. See [reverse proxy](reverse-proxy.md).

Run `mystuff images audit` to report missing or orphaned image files. It is deliberately non-destructive.
