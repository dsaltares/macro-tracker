# Deploy

The app ships as one container image and runs on the homelab next to Triumph, behind the
Cloudflare tunnel, at **`macros.saltares.dev`**. The reasoning is in
[ADR 0001](adr/0001-one-container-sqlite-on-a-volume.md).

## The image

`Dockerfile` builds the `output: 'standalone'` server on `node:24-alpine` and runs it as the
non-root `nextjs` user (uid 1001) on port 3014, with the database at `/data/db.sqlite` on the
`/data` volume. `instrumentation.ts` migrates the database to the latest version when the server
boots, so a new image brings its own schema and nothing has to run before it starts. The image
also carries `scripts/backup-database.ts`, which the deploy runs inside the container. Its
healthcheck calls `health.check` over tRPC, which answers once the database does.

Locally:

```sh
docker compose up --build
```

serves it on `127.0.0.1:3014` with the database in the `macro-tracker-data` volume.

## The pipeline

`.github/workflows/docker.yaml` builds and pushes
[`ghcr.io/dsaltares/macro-tracker`](https://github.com/dsaltares/macro-tracker/pkgs/container/macro-tracker)
on every push to `main` (tags `main` and `sha-<short>`) and on `v*` tags (the semver tags). Only
`main` deploys; a version tag publishes an image and stops there.

The `deploy` job runs in the `production` environment. It opens SSH to the homelab through
Cloudflare Access and pipes `.github/deploy/deploy.sh` into it, which:

1. takes a per-service lock, so overlapping deploys queue rather than race;
2. backs up the running database into `/data/backups/`, keeping the last ten;
3. pulls the image and recreates the service, which migrates on boot;
4. fails unless the container now runs the commit being deployed.

It needs, on the repository or the `production` environment:

| Kind | Name | What it is |
|---|---|---|
| Secret | `SSH_HOST` | The Access-protected SSH hostname, `ssh.saltares.dev` |
| Secret | `SSH_USER` | The user on the host that runs Docker |
| Secret | `SSH_PRIVATE_KEY` | An ed25519 key that user accepts |
| Secret | `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` | A Cloudflare Access service token allowed on the SSH application |
| Variable | `DEPLOY_COMPOSE_DIR` | Absolute path of the homelab compose project on the host |
| Variable | `DEPLOY_SERVICE` | The service's name in it, `macro-tracker` |

They are the same as Triumph's, so the values can be copied across.

## The homelab entry

In [`dsaltares/homelab`](https://github.com/dsaltares/homelab):

`apps/macro-tracker/docker-compose.yml`:

```yaml
name: macro-tracker

services:
  macro-tracker:
    container_name: macro-tracker
    image: ghcr.io/dsaltares/macro-tracker:main
    volumes:
      - ${DATA_PATH:-macro-tracker-data}:/data
    env_file:
      - .env
    environment:
      - DATABASE_URL=/data/db.sqlite
    restart: unless-stopped
    networks:
      - homelab-network

volumes:
  macro-tracker-data:

networks:
  homelab-network:
    external: true
    name: homelab_homelab-network
```

`apps/macro-tracker/env.template`, copied to `.env` on the host:

```sh
DATA_PATH=
INTERNAL_API_TOKEN=
```

`DATA_PATH` is a host directory such as `/mnt/store/homelab/macro-tracker`, so borgmatic backs it
up with the rest; it must be owned by uid 1001 (`sudo chown -R 1001:65533 <dir>`). Left empty,
the data lives in a named volume instead.

`INTERNAL_API_TOKEN` (`openssl rand -hex 32`) unlocks the internal import endpoint; left empty,
the endpoint answers `404` to everyone. The server imports reference foods on its own on the first
Sunday of each month at 03:00 in the container's time zone; `FOOD_IMPORT_CRON` sets another cron
pattern, and an empty one turns the schedule off. To start an import by hand, or see recent ones:

```sh
curl -X POST -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
  -d '{"sources":["off"]}' https://macros.saltares.dev/api/internal/imports/foods
curl -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
  https://macros.saltares.dev/api/internal/imports/foods
```

Then, in the same repo:

- add `./apps/macro-tracker/docker-compose.yml` to the `include` list in `docker-compose.yml`;
- add the ingress rule to `config/cloudflared/config.yml`, above the `http_status:404` catch-all:

  ```yaml
  - hostname: macros.saltares.dev
    service: http://macro-tracker:3014
  ```

- route the subdomain to the tunnel:
  `cloudflared tunnel route dns homelab macros.saltares.dev`;
- add the service to the README's app table, and its data directory to borgmatic's sources.

## First deploy

After the first push, check the package's visibility on GitHub: if it is private, make it public
or `docker login ghcr.io` on the host so it can pull. Then pull the homelab repo on the host, create the `.env`,
restart `cloudflared` to pick up the ingress rule, and push to `main` (or re-run the Docker
workflow). Once the job is green, `https://macros.saltares.dev` serves the home page.
