# Agent guide

Instructions for an AI agent installing or maintaining My Stuff for someone, including people who have never used a terminal. For contributing code, read [CONTRIBUTING.md](CONTRIBUTING.md) and the developer quick start in [README.md](README.md).

## Ground rules

- Keep the app on `127.0.0.1` or the home network. Exposing it to the internet, enabling the public shop, or setting `MYSTUFF_PUBLIC_URL` requires an explicit request from the person, HTTPS through a reverse proxy ([docs/reverse-proxy.md](docs/reverse-proxy.md)), and their confirmation before you change anything. Never publish the container port directly.
- Never delete the `mystuff-data` volume, the `./data` folder, or a backup unless the person asks for exactly that. Make a backup first (see below) and tell them that deleting the volume erases all items and photos.
- The setup link and the password are secrets. Show the setup link to the person only; do not paste it into issues, chats, or logs. Never put a password in a command argument or environment variable.
- Run one container per data volume.
- The person completes the setup wizard in their browser. Do not script the wizard or choose a password for them.

## Install (Docker Compose)

Requires Docker Engine 24+ with Compose v2. If `docker compose version` fails, help the person install Docker Desktop (macOS, Windows) or Docker Engine (Linux) first and confirm `docker run hello-world` works.

```sh
mkdir my-stuff && cd my-stuff
curl -O https://raw.githubusercontent.com/johnnybravo-xyz/mystuff/main/compose.yaml
docker compose up -d
docker compose exec app mystuff setup-token
```

If `docker compose up` cannot pull `ghcr.io/johnnybravo-xyz/mystuff`, the image has not been published for that tag. Build from source instead:

```sh
git clone https://github.com/johnnybravo-xyz/mystuff.git
cd mystuff
docker compose -f compose.yaml -f compose.build.yaml up -d --build
docker compose exec app mystuff setup-token
```

## Verify

```sh
docker compose ps
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>{console.log(r.status);process.exit(r.ok?0:1)})"
```

`200` means the app and database are ready. Then give the person the printed link (`http://127.0.0.1:3000/setup?token=…`) and tell them the wizard will ask for an administrator name and password, region, household profiles, collections, and optional features. Each step is checked before they move on; nothing is saved until they confirm the review.

The link stays valid across restarts until setup completes. After setup, the link stops working and the person signs in at `http://127.0.0.1:3000` with their password.

## Common problems

| Symptom | Fix |
| --- | --- |
| `port is already allocated` for 3000 | Change `127.0.0.1:3000:3000` to e.g. `127.0.0.1:3001:3000` in `compose.yaml`, run `docker compose up -d`, and use port 3001 in the link. |
| `container name "/mystuff" is already in use` (plain Docker) | An earlier container exists. `docker start mystuff` to reuse it, or ask before removing it with `docker rm -f mystuff` (the data volume is kept). |
| Wizard says the setup link has expired | The tab belongs to an older installation (volume recreated or token rotated). Run `mystuff setup-token` and open the new link instead of the old tab. |
| Wizard says a setup link is needed | The URL lost its `?token=` part. Print the link again with `mystuff setup-token`. |
| `setup-token` says setup is complete | Setup already finished. Use the sign-in page; if the password is lost, see below. |
| Forgotten password | `docker compose exec app mystuff password reset` (interactive). Signs out all sessions; items are untouched. |
| Permission denied under `/data` | Use the default named volume. For a bind mount, make the folder owned by UID/GID 1000. |
| Anything else | `docker compose logs app` shows structured `archive.*` and `installation.*` events. See [docs/troubleshooting.md](docs/troubleshooting.md). |

## Backup and upgrade

```sh
docker compose exec app mystuff backup /data/backups/my-stuff.tar.gz
docker compose exec app mystuff restore --verify /data/backups/my-stuff.tar.gz
docker compose cp app:/data/backups/my-stuff.tar.gz ./my-stuff.tar.gz
```

A backup inside the volume does not survive deleting the volume; copy it out as shown. Back up before every upgrade, then follow [docs/upgrades.md](docs/upgrades.md). Restores are covered in [docs/backup-restore.md](docs/backup-restore.md).

## Without Compose

```sh
docker build -t mystuff .
docker run -d --name mystuff -p 127.0.0.1:3000:3000 -v mystuff-data:/data mystuff
docker exec mystuff mystuff setup-token
```

Replace `docker compose exec app` with `docker exec mystuff` in the commands above.
