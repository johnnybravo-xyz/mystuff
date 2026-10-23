# Contributing

Use Node 24 or newer. Keep changes small, explicit, and easy to test. Do not add real inventory, private hostnames, credentials, setup URLs, or personal deployment history.

```sh
npm ci
npx tsc --noEmit
npm test
npm run build
npm run test:production
```

For container changes, also run:

```sh
docker compose -f compose.yaml -f compose.build.yaml config --quiet
docker build -t mystuff:test .
```

Add tests for observable behavior, migrations, backup compatibility, authentication boundaries, and public/private projection changes. Migrations are immutable after release; add the next ordered migration rather than editing an applied one.

By contributing, you agree that your contribution is licensed under AGPL-3.0-only. See `SECURITY.md` for private vulnerability reports.
