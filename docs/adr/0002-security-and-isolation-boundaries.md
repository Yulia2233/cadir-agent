# ADR 0002: Security and Isolation Boundaries

- Status: Accepted
- Date: 2026-07-14
- Owners: CADIR security and platform teams

## Context

CADIR processes untrusted prompts, documents, archives, CAD files, generated Python, public Case content, and user-supplied model-provider endpoints. OpenCode permissions and prompt instructions alone cannot provide tenant isolation.

## Decision

Use three independent enforcement layers:

1. Data authorization: every private lookup includes the authenticated `user_id` and follows the resource back to its owning conversation. Administrative paths additionally require a reviewer or administrator role.
2. File authorization: each conversation owns an unpredictable workspace UUID. All filesystem operations reject absolute paths and traversal, resolve a trusted root, reject link escapes, and repeat boundary checks at the final operation.
3. Execution authorization: each task runs in a new non-root, network-denied, read-only-root container with bounded CPU, memory, disk, PID count, time, and logs. Only the current working copy is writable.

The browser reaches only the CADIR API. Internal OpenCode, Runner, Validator, Viewer, Case, queue, database, object storage, and FreeCAD endpoints are placed on non-public service networks.

The main CAD Agent receives a fixed allow-list of structured tools. It cannot invoke arbitrary shell commands, install packages, read the environment, choose server paths, access storage credentials, or use unrestricted networking. Generated `Model/model.py` passes AST policy checks and is executed only through the fixed Runner entry point.

Uploads are untrusted until extension, MIME, magic bytes, size, quota, malware, archive path, and parser checks pass. Agent-visible upload and import mounts are read-only. STEP and STL parsing happens in fixed ingestion services, never in Agent-written conversion scripts.

Provider Base URLs allow HTTPS public endpoints only unless an administrator configured a named internal provider. DNS is resolved and revalidated at connection time; loopback, link-local, metadata, multicast, private, reserved, and redirect-to-restricted addresses are rejected.

Provider keys are encrypted with envelope encryption, injected only into the model-call boundary, never returned in full, and redacted from logs, errors, events, screenshots, fixtures, and artifacts. Credentials used by tests come only from environment variables or the CI secret store.

Candidate storage, tables, service credentials, and indexes are separate from public Cases. Ordinary users and the main Agent have no candidate read path. Publication is a checksum-verified copy performed only after automated checks and a human approval transaction.

## P0 control mapping

| Threat or trust-boundary failure                                  | Preventive controls                                                                                        | Required P0 evidence                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication bypass and role escalation                         | Server-side session validation, secure cookie, CSRF/origin checks, role middleware                         | AUTH-001, AUTH-002, AUTH-004 through AUTH-007, AUTH-009, AUTH-010, AUTH-012, AUTH-013                                                                                                                                                        |
| IDOR across conversations, files, selections, events, or settings | Owner-scoped queries; opaque IDs; no client owner trust; non-enumerating errors                            | CFG-015, CONV-020, CONV-021, CONV-024, UP-025, REV-012, EVT-011, EVT-012, SEC-008                                                                                                                                                            |
| SSRF through Provider configuration                               | URL scheme and host policy, DNS/IP validation, redirect revalidation, bounded timeouts                     | CFG-013                                                                                                                                                                                                                                      |
| API key and sensitive-content disclosure                          | Envelope encryption; scoped injection; structured redaction; secret scan                                   | CFG-002, CFG-005, CFG-010, CFG-014, ISO-020, CAND-011 through CAND-013, REC-016, SEC-007, SEC-017                                                                                                                                            |
| Prompt injection and privilege escalation                         | Domain guard, untrusted-data envelopes, fixed tool allow-list, no shell/network/env                        | GUARD-001, GUARD-002, GUARD-004, GUARD-006 through GUARD-011, RET-015, E2E-012, SEC-001 through SEC-004                                                                                                                                      |
| Path traversal, link escape, Zip Slip, and TOCTOU                 | Rooted descriptor operations, path normalization, link rejection, safe archive extraction, repeated checks | MSG-019, ISO-007 through ISO-014, ISO-028                                                                                                                                                                                                    |
| Sandbox breakout and resource abuse                               | Non-root runtime, read-only root, no external network or Docker socket, quotas, process-tree cleanup       | CODE-010 through CODE-015, CODE-017, ISO-015 through ISO-023                                                                                                                                                                                 |
| Concurrent overwrite and late publication                         | Per-conversation lease lock, task cancellation token, immutable revisions, transactional publish           | MSG-011, MSG-012, MSG-014, ISO-024, REV-004, REV-015, REC-012 through REC-014                                                                                                                                                                |
| XSS, CSRF, and SQL injection                                      | Output escaping and sanitization, parameterized ORM, secure cookies, CSRF/origin enforcement               | MSG-018, SEC-009 through SEC-013                                                                                                                                                                                                             |
| Candidate leakage or malicious publication                        | Separate credentials/index, automated sandbox replay and scanning, human role approval                     | RET-006, RET-009, RET-011, CAND-001 through CAND-016, CAND-021, CAND-022, CAND-024, CAND-025, REVIEW-011 through REVIEW-015, REVIEW-019 through REVIEW-021, REVIEW-024                                                                       |
| Corrupt or confused CAD artifacts                                 | Canonical JSON strict replay, checksums, BRep validation, revision-bound viewer maps                       | CODE-001 through CODE-005, CODE-008, VAL-001 through VAL-009, VAL-011 through VAL-014, VAL-019 through VAL-022, VAL-028, VAL-030, REV-001, REV-002, REV-007 through REV-012, REV-015, REV-016, TOPO-001 through TOPO-008, TOPO-012, TOPO-015 |
| Selection confusion across revisions                              | Revision-bound topology references; semantic/graph/signature relocation; never display-index-only          | VIEW-010, VIEW-011, VIEW-015, VIEW-018, VIEW-020, VIEW-022 through VIEW-024, VIEW-027 through VIEW-029                                                                                                                                       |

## Detection and recovery

- Immutable audit records cover authentication, retrieval, candidate checks, review, publication, unpublication, and administrative changes.
- Structured logs carry trace, user, conversation, task, runtime, and revision identifiers while omitting document bodies and model objects.
- Runtime policy failures, repeated ID guesses, rejected SSRF targets, malware findings, candidate secret findings, queue dead letters, and cross-tenant denials emit metrics and alerts.
- Deletion immediately revokes authorization and signed-download issuance before asynchronous cleanup.
- Published revisions and Cases are immutable. Recovery restores database and object-storage snapshots and verifies all recorded checksums before service resumes.

## Consequences

Security tests are release gates rather than optional hardening. A failed P0 control blocks publication. OpenCode Permission remains defense in depth and is never accepted as the multi-tenant boundary.
