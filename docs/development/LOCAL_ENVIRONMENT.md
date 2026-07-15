# Local Development Environment

CADIR uses the same Linux containers for PostgreSQL, Redis, MinIO, OpenCode, Runner, Web, API, and FreeCAD on every development host. Only the wrapper shell differs.

## Windows

- Use Docker Desktop with the WSL2 Linux container backend.
- Run `pwsh scripts/dev-env.ps1 up`, `health`, or `down` from the repository root.
- Keep the repository on a local NTFS volume. Docker owns the named workspace volume; do not edit its Linux ownership from Windows.
- Git may display LF/CRLF conversion warnings. Prettier and the committed `.gitattributes` define the canonical representation.

## Linux and macOS

- Use Docker Engine with Compose v2 on Linux, or Docker Desktop on macOS.
- Run `./scripts/dev-env.sh up`, `health`, or `down` from the repository root.
- Linux production and CI use numeric non-root UIDs. Do not replace them with the host user or grant world-writable permissions.

## Shared rules

- Copy `.env.example` to an untracked `.env` and fill every empty secret value. Never commit `.env`.
- Use `localhost:3000` for Web and `localhost:8080` for direct API development. Internal service names such as `opencode`, `runner`, `postgres`, and `minio` are intentionally unavailable outside Docker networks.
- Run `pnpm dev:health` after startup. The readiness response verifies API, OpenCode, Runner, SimpleCADAPI, and Skill versions.
- Use `docker compose -f infra/compose.yaml down` for a non-destructive stop. Do not add `--volumes` unless the explicit goal is to erase all local development data.
