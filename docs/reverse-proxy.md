# Reverse proxy and HTTPS

Set `MYSTUFF_PUBLIC_URL` to the public HTTPS origin before enabling the shop. Set `VINEXT_TRUSTED_HOSTS` to the comma-separated hostnames accepted from forwarded requests. Proxies must preserve `Host` and the original scheme and permit uploads of at least 8 MiB.

## Caddy

```caddy
stuff.example.com {
  encode zstd gzip
  request_body { max_size 10MB }

  @static path /_next/static/*
  header @static Cache-Control "public, max-age=31536000, immutable"

  @private path /api/* /shop/images/*
  header @private Cache-Control "no-store"

  reverse_proxy 127.0.0.1:3000
}
```

Caddy passes streaming responses by default. Do not add response buffering or shared caching for `/api/*`.

## nginx

```nginx
server {
  listen 443 ssl http2;
  server_name stuff.example.com;
  client_max_body_size 10m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
  }

  location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }

  location ~ ^/(api|shop/images)/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    add_header Cache-Control "no-store" always;
  }
}
```

## Traefik

```yaml
labels:
  - traefik.enable=true
  - traefik.http.routers.mystuff.rule=Host(`stuff.example.com`)
  - traefik.http.routers.mystuff.entrypoints=websecure
  - traefik.http.routers.mystuff.tls=true
  - traefik.http.services.mystuff.loadbalancer.server.port=3000
```

Traefik preserves forwarded host and scheme by default. Apply its buffering middleware only with an 8 MiB or larger request limit and do not attach a cache middleware to private routes.

## Image caching and Cloudflare

Authenticated images at `/api/images/*` return `private, max-age=31536000` plus `Vary: Cookie, Authorization`. This lets a visitor's browser retain immutable image bytes for a year while forbidding a shared cache.

Public shop images at `/shop/images/*` return `no-store`. Keep that policy: a cached photo must disappear as soon as its listing is withdrawn. Cache static fingerprinted assets under `/_next/static/*` for one year. In Cloudflare, create Cache Rules in this order:

1. Bypass cache for `/api/*`, `/shop/images/*`, `/setup*`, and `/signin*`.
2. Eligible for cache with a one-year edge/browser TTL only for `/_next/static/*`.
3. Leave all other HTML on origin cache headers; do not enable “Cache Everything”.

Cloudflare proxying is optional. Do not depend on its access controls in place of My Stuff authentication.
