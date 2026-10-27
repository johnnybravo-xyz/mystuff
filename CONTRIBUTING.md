# Contributing

Use Node 24 or newer to run the app and Bun 1.4.3 (pinned in `package.json`) to install packages and run scripts. Keep changes small, explicit, and easy to test. Do not add real inventory, private hostnames, credentials, setup URLs, or personal deployment history.

```sh
bun install --frozen-lockfile
bunx tsc --noEmit
bun run test
bun run build
bun run test:production
```

Use `bun run test`, not `bun test`: the test script runs Node's test runner, while `bun test` starts Bun's own runner. Commit `bun.lock`; do not add a `package-lock.json`.

For container changes, also run:

```sh
docker compose -f compose.yaml -f compose.build.yaml config --quiet
docker build -t mystuff:test .
```

Add tests for observable behavior, migrations, backup compatibility, authentication boundaries, and public/private projection changes. Migrations are immutable after release; add the next ordered migration rather than editing an applied one.

By contributing, you agree that your contribution is licensed under AGPL-3.0-only. See `SECURITY.md` for private vulnerability reports.
