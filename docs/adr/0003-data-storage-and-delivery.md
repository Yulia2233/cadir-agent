# ADR 0003: Data, Storage, and Delivery

- Status: Accepted
- Date: 2026-07-14
- Owners: CADIR platform team

## Decision

Use PostgreSQL as the transactional system of record, S3-compatible object storage for immutable and large binary artifacts, and Redis for ephemeral caches, BullMQ queues, event replay buffers, and leased conversation locks.

Object keys are server-generated beneath distinct private prefixes for uploads, revisions, candidates, and public Cases. Clients address files by opaque artifact IDs and never submit internal object keys or server paths. Every stored artifact records byte length, media type, safe download name, SHA-256 checksum, backend, and version metadata.

Use one PostgreSQL cluster in the initial release with role-separated schemas and least-privilege service accounts. User-owned queries include both resource ID and authenticated owner ID or an ownership join in the same query. Candidate tables and objects have no grants for the main CAD Agent or ordinary-user API paths.

Use PostgreSQL full-text search, `pg_trgm`, and pgvector for public Case retrieval. Publication writes the immutable Case row and artifacts, then creates its search entry. Unpublication removes or disables the search entry and download authorization in the same workflow. Candidates are never indexed.

Use BullMQ with stable job IDs and domain idempotency keys. Workers acquire leases, heartbeat, classify retryable errors, and move exhausted jobs to a dead-letter queue. Repeated delivery must return the existing domain result and cannot create duplicate revisions or Cases.

Use Redis leased locks named `conversation:{id}:write` to serialize changes within one conversation. Database constraints and publication transactions remain authoritative if a lease expires or Redis is unavailable.

Local development uses Docker Compose. Production uses managed PostgreSQL, Redis, and S3-compatible storage plus Kubernetes deployments for long-running services and disposable Jobs for CAD and FreeCAD execution. Deployments run migrations before compatible application rollout, execute post-deploy health and smoke checks, and retain the immediately previous immutable image set for rollback.

## Alternatives considered

- Storing CAD artifacts in PostgreSQL was rejected because large immutable binary packages would increase backup and replication cost.
- Elasticsearch and a separate vector database were deferred because the initial Case corpus does not justify extra publication and authorization surfaces.
- Redis-only locks were not accepted as a data integrity mechanism; locks improve coordination while database constraints and transactions enforce truth.
- In-process queues were rejected because they do not survive API restarts and cannot provide durable idempotency evidence.

## Consequences

- Every schema change is delivered as a checked migration.
- Object writes are staged and checksum-verified before database publication.
- Backup and recovery exercises must validate database-to-object references and checksums.
- Queue, lock, and event data may be reconstructed; revisions, artifacts, consent, review, and publication records may not.
