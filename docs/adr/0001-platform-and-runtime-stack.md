# ADR 0001: Platform and Runtime Stack

- Status: Accepted
- Date: 2026-07-14
- Owners: CADIR platform team

## Context

CADIR needs a modular Web application, a multi-tenant control API, durable workflow jobs, isolated Python CAD runtimes, exact BRep processing, and a single contract source shared by the backend and Web. Development must run on Windows while deployment targets Linux containers.

## Decision

Use the following single baseline stack for this release:

| Concern                        | Decision                                           | Pinned baseline                                                          |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Monorepo                       | pnpm workspaces                                    | pnpm 10.13.1                                                             |
| JavaScript runtime             | Node.js                                            | 22.17.1 LTS                                                              |
| CADIR API                      | TypeScript, Fastify, Zod                           | TypeScript 5.8.3, Fastify 5.4.0, Zod 3.25.76                             |
| Web                            | React, Vite, React Router, TanStack Query, Zustand | React 19.1.0, Vite 7.0.6, Router 7.7.1, Query 5.83.0, Zustand 5.0.6      |
| UI and viewer                  | CSS variables, Lucide, Three.js                    | Lucide React 0.536.0, Three.js 0.178.0                                   |
| Database                       | PostgreSQL with Prisma migrations                  | PostgreSQL 17.5, Prisma 6.12.0                                           |
| Object storage                 | S3 API, MinIO in local development                 | MinIO image pinned by digest before M0 closes                            |
| Queue, cache, lock, SSE replay | Redis and BullMQ                                   | Redis 8.0, BullMQ 5.56.7                                                 |
| Public Case search             | PostgreSQL full-text, `pg_trgm`, `pgvector`        | pgvector 0.8.x                                                           |
| Contracts                      | Zod schemas exported by `packages/contracts`       | One source for REST and SSE types                                        |
| CAD services                   | Python                                             | Python 3.12                                                              |
| CAD SDK                        | SimpleCADAPI                                       | 2.0.1b1 at upstream commit `d727cb1ef1409433c8ef4be446e7117d323f9ade`    |
| OpenCode engine                | Vendored internal fork adapter                     | upstream tag `v1.4.9`, commit `803d9eb7ad5f4dfd832d7506a7cad83ded52253e` |
| CAD kernel                     | `cadquery-ocp`                                     | 7.9.3.1                                                                  |
| Runner isolation               | Linux rootless OCI containers                      | Docker Engine 29 locally; Kubernetes Jobs in production                  |
| FreeCAD worker                 | Linux isolated worker                              | FreeCAD 1.0.x, exact image digest recorded by T1902                      |
| TypeScript tests               | Vitest and Playwright                              | Vitest 3.2.4, Playwright 1.55.0                                          |
| Python tests                   | pytest                                             | version pinned in the CAD service lock file                              |

Use a modular monorepo with `apps/api`, `apps/web`, independently owned domain services, `workers/freecad`, shared contracts, infrastructure, and a root `tests/` workspace for cross-service acceptance and security scripts. Unit tests remain beside their owning modules.

Run API request work synchronously only for bounded operations. CAD execution, validation, viewer generation, candidate precheck, and FreeCAD conversion are BullMQ jobs with explicit idempotency keys, leases, retry policies, and dead-letter handling.

Use PostgreSQL row ownership and service authorization as the primary data boundary. Redis locks coordinate a single writer per conversation but never replace database authorization or constraints.

OpenCode is internal-only. CADIR implements an adapter around the pinned upstream engine, keeps custom code under `packages/opencode-cadir`, records the upstream remote and commit, and performs upgrades through a reviewed `upstream-sync` branch. The raw OpenCode server is not exposed to the browser or public ingress.

## Alternatives considered

- NestJS was not selected because Fastify provides the required typed plugin and validation model with less framework surface.
- A separate vector database was deferred because PostgreSQL text, geometry filters, and pgvector preserve transactional publication boundaries for the initial public Case library.
- Kubernetes was not required for local development; Docker Compose provides parity for dependencies while production uses Jobs for disposable CAD runtimes.
- Git submodules were not selected for OpenCode or SimpleCADAPI because release builds need a reviewed, reproducible vendor boundary without mutating the existing user-authored `SimpleCADAPI/` checkout.

## Consequences

- All API and event payloads must originate in `packages/contracts`.
- Database changes require Prisma migrations and migration verification in CI.
- Image tags used during development must be replaced by immutable digests before M0 is marked complete.
- Windows developers use Node services directly and Linux containers for PostgreSQL, Redis, MinIO, CAD Runner, Viewer, Validator, and FreeCAD.
- Provider-specific model identifiers remain configuration values; no provider credential or private endpoint is committed.
