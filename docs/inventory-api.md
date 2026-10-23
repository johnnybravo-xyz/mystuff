# Inventory API v1

The optional inventory API lets a trusted local integration read and update the private archive. It is disabled until `ARCHIVE_AGENT_TOKEN_SHA256` contains the lowercase SHA-256 digest of a random bearer token. Keep the raw token outside the repository and `/data` exports.

Send `Authorization: Bearer <token>` to:

- `GET /api/integration` — versioned schema, values, limits, and supported actions.
- `GET /api/archive` — full private archive.
- `POST /api/archive` — add, update, Trash, restore, group, outfit, preference, and import actions.
- `POST /api/images` — authenticated multipart image upload.
- `POST /api/product-preview` — guarded public product URL preview.

The token grants API access only. It does not create a browser session. Browser writes also use same-origin checks; an integration authenticates with its bearer token.

## Idempotency and conflicts

Use a stable `requestId` for `add`. Retrying the same account-scoped request returns the original entry. Updates accept `expectedUpdatedAt` values so a stale client receives 409 instead of replacing a newer edit. Group moves similarly require the last-read group identity.

The live contract from `/api/integration` is authoritative for category IDs, profile IDs, currencies, actions, and limits. Do not hard-code household profile IDs: labels can change and new installations use generated IDs.

## Privacy

The API contains private prices, notes, purchase facts, owner profiles, image IDs, groups, and inquiries. Keep it on an authenticated private network, rotate a leaked token digest, and avoid logging request bodies. Public shop routes use a separate strict projection and never accept this bearer token as a browser login.
