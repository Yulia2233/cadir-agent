# CADIR-Agent

CADIR-Agent is a modular CAD modeling system with a browser Web client, a multi-tenant API control plane, isolated CAD execution, BRep-derived viewing, reviewed public model Cases, and optional FreeCAD conversion.

The product source lives in this directory. `apps/api` and `apps/web` are independently deployable, shared runtime contracts live in `packages/contracts`, CAD and orchestration services live under `services`, and cross-service scripts and acceptance tests live in `tests`.

## Requirements

- Node.js 22.17 or newer within the supported Node 22 LTS line
- pnpm 10.13.1 through Corepack
- Docker Engine 27 or newer with Docker Compose v2
- A Linux Docker host for deployment; `linux/amd64` is the verified baseline

## Local setup

1. Copy the empty variable names from `.env.example` into an untracked `.env` and set strong local values. Never commit this file.
2. Enable pnpm and install locked dependencies:

   ```sh
   corepack enable
   pnpm install --frozen-lockfile
   ```

3. Start infrastructure and the API:

   ```sh
   docker compose --env-file .env -f infra/compose.yaml up -d --build
   pnpm dev:health
   ```

4. Run checks:

   ```sh
   pnpm verify
   pnpm test:integration
   pnpm test:e2e
   ```

The API listens on `http://localhost:8080` and exposes liveness/readiness at `/health/live` and `/health/ready`. The Web development server listens on `http://localhost:3000` after `apps/web` is enabled.

## Server deployment

The checked-in images use pinned Debian Linux bases, multi-stage builds, non-root numeric users, health checks, bounded logs, and no embedded credentials. The verified server baseline is Linux `amd64`, Docker Engine 27+, and Docker Compose v2. Production credentials must come from the server secret manager or a root-owned environment file outside the repository.

On the server, create the configuration once and deploy through the checked-in wrapper:

```sh
sudo install -d -m 0750 /etc/cadir
sudo install -m 0600 infra/server.env.example /etc/cadir/cadir.env
sudo editor /etc/cadir/cadir.env
export CADIR_ENV_FILE=/etc/cadir/cadir.env
pnpm server:check
pnpm server:up
pnpm server:health
```

The server overlay publishes no application or dependency ports. Attach the unprivileged Web container to the external `cadir-edge` network and terminate HTTPS in a hardened reverse proxy on that network. The Web container proxies `/api/` to the internal API. PostgreSQL, Redis, MinIO, API, Runner, and future CAD workers remain on private Docker networks.

For upgrades, take the required database and object-storage backup, set `CADIR_VERSION` to the immutable release tag, and run `pnpm server:up`. API startup applies forward-only Prisma migrations before accepting traffic. Roll application images back only when the database migration is backward compatible; schema rollback requires the release-specific restore procedure.

See `docs/deployment/SERVER_DOCKER.md` for firewall, reverse-proxy, backup, upgrade, and verification details.

## Repository rules

- `Model/model.py` is the sole CAD modeling entry point.
- Canonical `Model/model.json` is generated with `GraphSession` and drives FreeCAD conversion.
- Every successful revision includes Python, Model JSON, STEP, STL, validation, previews, GLB, topology mapping, and BRep edge data.
- Candidates never auto-publish and never appear in ordinary Agent search.
- Provider keys are encrypted at rest, never returned in plaintext, and never logged.

See `docs/adr`, `docs/baseline`, and `docs/configuration` for decisions and limits.
