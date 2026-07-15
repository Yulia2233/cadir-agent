# Shared contracts

`@cadir/contracts` is the runtime-validated source of truth shared by the CADIR API,
workers, services, and Web client. Consumers must import these schemas and inferred
TypeScript types instead of declaring local copies.

The initial surface includes the REST route registry, common response models, Task
statuses and phases, Artifact and Case enums, Selection records, Viewer manifests,
and every public CADIR event listed in the product requirements.

Provider configuration routes include a server-side connection probe and a bounded
OpenAI-compatible model-list operation. Both use the encrypted user credential at
the API boundary; the Web receives model IDs only and never receives the key.

The canonical wire format uses camelCase for REST JSON and snake_case for the SSE
envelope retained by the requirements (`event_id`, `conversation_id`, `task_id`).
This exception is deliberate and must not be normalized independently by consumers.

## Compatibility policy

- Event and enum values are append-only within a minor release.
- Existing fields keep their meaning and wire name.
- New optional fields are backward compatible; new required fields require a major
  contract version.
- Public identifiers are UUIDs except SSE `event_id`, which starts with `evt_`.
- REST errors use `apiErrorSchema`; callers must not infer behavior from error text.
- Event payloads are validated by the event-specific schema before persistence or
  delivery. Unknown event types and malformed payloads are rejected.

## Event delivery

Every event carries the owning Conversation ID, optional Task ID, server timestamp,
and monotonically increasing per-conversation sequence. SSE uses `event_id` as the
wire `id` value for `Last-Event-ID` recovery. The sequence lets clients merge a small
amount of out-of-order delivery without applying an event twice.

The Web client may display only phase, tool, and result summaries represented by the
public event schemas. Hidden model reasoning is not part of this contract.

## Verification

Run:

```powershell
pnpm --filter @cadir/contracts typecheck
pnpm --filter @cadir/contracts test
pnpm --filter @cadir/contracts build
```
