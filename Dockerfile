# Bun installs packages and runs build scripts; Node 24 runs the app.
FROM oven/bun:1.4.3 AS bun

FROM node:24-bookworm-slim AS dependencies
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN bun run build && chmod -R a+rX dist

FROM build AS test
COPY --chown=node:node . .

FROM node:24-bookworm-slim AS production-dependencies
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:24-bookworm-slim AS runtime
ARG VERSION=0.1.0
LABEL org.opencontainers.image.title="My Stuff" \
      org.opencontainers.image.description="A private, self-hosted household inventory" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.licenses="AGPL-3.0-only"
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tar \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 ARCHIVE_DATA_DIR=/data MYSTUFF_VERSION=$VERSION
COPY package.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist/standalone ./
COPY scripts/mystuff.mjs scripts/start.mjs /app/scripts/
RUN chmod 0755 /app/scripts/mystuff.mjs \
    && ln -s /app/scripts/mystuff.mjs /usr/local/bin/mystuff \
    && mkdir /data \
    && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "scripts/start.mjs"]
