# Install My Stuff

## Requirements

- Docker Engine 24+ with Docker Compose v2.
- A host directory or Docker volume with enough space for photos and backups.
- HTTPS if the service is reachable beyond a trusted local network.

## Docker Compose

```sh
mkdir my-stuff && cd my-stuff
curl -O https://raw.githubusercontent.com/johnnybravo-xyz/mystuff/main/compose.yaml
docker compose up -d
docker compose exec app mystuff setup-token
```

Open `http://127.0.0.1:3000/setup?token=…` using the printed token. The container also logs the link as an `installation.setup.ready` event on every start until setup completes:

```sh
docker compose logs app | grep setup.ready
```

The token survives container restarts. It is kept in `/data/secrets/setup.token` (mode 0600, next to `session.key`) with its digest in the database, and both are removed when setup completes. Deleting the volume creates a new installation with a new token, so a browser tab opened before that will be rejected on its first step. To invalidate a link that may have leaked:

```sh
docker compose exec app mystuff setup-token --rotate
```

The default named volume avoids host UID/GID problems. For a bind mount, create the directory and make it writable by UID/GID 1000:

```sh
mkdir -p data
sudo chown 1000:1000 data
```

Then replace `mystuff-data:/data` with `./data:/data` in Compose.

## Verify

```sh
docker compose ps
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/ready').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
```

`/api/health` checks the process. `/api/ready` opens the database and returns 503 when storage or migration startup is unavailable.

## Build from source

```sh
git clone https://github.com/johnnybravo-xyz/mystuff.git
cd mystuff
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

Without Compose:

```sh
docker build -t mystuff .
docker run -d --name mystuff -p 127.0.0.1:3000:3000 -v mystuff-data:/data mystuff
docker exec mystuff mystuff setup-token
```

Replace `docker compose exec app` with `docker exec mystuff` in the other commands in these docs.

Pin an image tag or digest in `MYSTUFF_IMAGE` before production upgrades. Do not run more than one application process against the same `/data` volume.
