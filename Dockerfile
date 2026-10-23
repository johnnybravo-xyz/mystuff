FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ARG VERSION=1.0.0
LABEL org.opencontainers.image.title="My Stuff" \
      org.opencontainers.image.description="A private, self-hosted household inventory" \
      org.opencontainers.image.version=$VERSION \
      org.opencontainers.image.licenses="AGPL-3.0-only"
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tar \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 ARCHIVE_DATA_DIR=/data MYSTUFF_VERSION=$VERSION
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm rebuild argon2 \
    && npm cache clean --force
COPY --from=build /app/dist/standalone ./
COPY scripts/mystuff.mjs /app/scripts/mystuff.mjs
RUN chmod 0755 /app/scripts/mystuff.mjs \
    && ln -s /app/scripts/mystuff.mjs /usr/local/bin/mystuff \
    && mkdir /data \
    && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
