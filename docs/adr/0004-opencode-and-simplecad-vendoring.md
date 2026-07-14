# ADR 0004: OpenCode and SimpleCADAPI Vendoring

- Status: Accepted
- Date: 2026-07-14
- Owners: CADIR Agent and CAD teams

## Context

The release requires a customized OpenCode execution engine and a SimpleCADAPI SDK whose Skill documentation exactly matches the installed package. The parent workspace contains a user-authored SimpleCADAPI checkout with unrelated changes; CADIR must not move or rewrite it.

## Decision

Pin OpenCode to upstream tag `v1.4.9`, commit `803d9eb7ad5f4dfd832d7506a7cad83ded52253e`. Keep the upstream MIT license and copyright notices. Store the upstream source in a reproducible vendor package or source archive and keep all CADIR modifications in `packages/opencode-cadir`. Record `https://github.com/sst/opencode.git` as the upstream remote in vendor metadata. Synchronization happens on a dedicated `upstream-sync` branch, with upstream tests and CADIR adapter tests required before merge.

Pin SimpleCADAPI to release `2.0.1b1`, upstream commit `d727cb1ef1409433c8ef4be446e7117d323f9ade`. Produce CADIR's vendor artifact from that exact clean upstream revision and include its license, source checksum, SDK package, Skill, API index, exact API pages, and core type pages. Do not copy from the parent workspace's modified working tree.

At service and Runner startup, compare the SDK distribution version with the Skill metadata version. Also verify required Skill and API-index files are present, readable, immutable in the runtime, and match the recorded package manifest. A mismatch marks the instance unhealthy and prevents it from accepting modeling work.

Every task records the OpenCode commit, Agent prompt version, SimpleCADAPI version, Skill version, Runner image digest, and exact Skill/API/core documents loaded. The state machine cannot transition into `CODE` until the mandatory Skill and API-index reads are recorded.

## Consequences

- Vendor metadata and checksums are reviewed and committed; generated runtime credentials are never part of vendor artifacts.
- The existing parent `SimpleCADAPI/` directory remains untouched by CADIR bootstrap and build scripts.
- Every newly used SimpleCAD API requires its exact Markdown page, plus applicable core type documentation, to be packaged and loaded before use.
- Updating OpenCode or SimpleCADAPI is an explicit compatibility change, not an automatic dependency update.
