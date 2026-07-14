# Docker Server Deployment

## Compatibility baseline

- Linux kernel with cgroup v2 and overlay2 storage.
- Docker Engine 27 or newer and Docker Compose v2.
- `linux/amd64` is the verified image target. Other architectures are unsupported until the pinned OCP and VTK wheels have been built and tested for that target.
- At least 8 GiB RAM and 4 CPU cores for the current API, dependency, and CAD Runner topology. Production capacity must follow measured workload results.
- A reverse proxy attached only to the external `cadir-edge` network.

Rootless Docker is preferred. If rootful Docker is used, restrict membership of the `docker` group because it is host-equivalent authority. Never mount `/var/run/docker.sock` into an application or Runner container.

## Configuration

Copy `infra/server.env.example` to `/etc/cadir/cadir.env`, fill every empty secret, and set mode `0600`. Do not place Provider API keys in Compose YAML, image layers, or source-controlled files. User Provider credentials are stored through the application encryption layer.

Use random values of at least 32 bytes for session and CSRF secrets. `MODEL_CONFIG_KEK` is an application encryption key and must satisfy the API format documented by the secret-management runbook. `CORS_ORIGINS` must contain only the deployed HTTPS Web origins.

## Network and ingress

`infra/compose.server.yaml` removes all host port publications. The reverse proxy reaches only `web:8080` over `cadir-edge`; the Web container forwards `/api/` over the private backend network. Database, cache, object storage, API, and Runner never join the edge network.

Allow inbound TCP 443 only (and TCP 22 from an administrative allow-list). Do not expose ports 5432, 6379, 9000, 8080, or 8091. Use a TLS certificate and send HSTS at the reverse proxy after HTTPS has been verified.

## Deployment

```sh
corepack enable
corepack prepare pnpm@10.13.1 --activate
export CADIR_ENV_FILE=/etc/cadir/cadir.env
pnpm server:check
pnpm server:up
pnpm server:health
```

The `check` action validates Linux, Docker, Compose, the secret file, and the merged Compose model. The `up` action creates the edge network if needed, builds the images, waits for health checks, and removes orphan containers. The API deploys pending Prisma migrations before starting its listener.

## Security properties

- API, Web, and Runner run as fixed non-root numeric users.
- Application root filesystems are read-only with only bounded tmpfs and declared volumes writable.
- Containers enable `no-new-privileges` and bounded JSON log rotation.
- The Runner has a PID, memory, CPU, output, and wall-time limit. Its health check verifies the installed SimpleCADAPI version and required read-only Skill documents.
- Docker socket and host paths are not mounted.
- The backend and Runner control networks are internal.

The long-lived Runner service is a control-plane implementation stage. Final task execution must still create a disposable, network-disabled sandbox per task before isolation acceptance tests can be marked complete.

## Upgrade and rollback

1. Back up PostgreSQL and the MinIO data volume and verify the backup can be read.
2. Set `CADIR_VERSION` to the new immutable release version.
3. Run `pnpm server:check` and `pnpm server:up`.
4. Run `pnpm server:health`, then the deployment smoke suite.
5. If an application regression occurs and migrations are backward compatible, restore the previous `CADIR_VERSION` and run `pnpm server:up` again.
6. If a schema migration is not backward compatible, stop writes and restore PostgreSQL and object storage together from the coordinated backup. Do not attempt an ad hoc down migration.

Keep the previous image versions until the post-deployment observation window completes. Record image digests, migration versions, health evidence, and rollback results in the release record.

## Backup commands

Run backups from an access-controlled operations host and store them outside Docker volumes. Avoid putting passwords in process arguments or terminal history. Use `PGPASSWORD` from the protected environment file or Docker secrets and pipe `pg_dump` to encrypted backup storage. MinIO backups must preserve object names, checksums, and versioning state.
