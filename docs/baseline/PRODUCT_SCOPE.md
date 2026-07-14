# CADIR-Agent Product Scope Baseline

Version: 1.0.0

Status: Frozen for the current release

Authority: `AGENTS.md` and `CAD_AGENT_WEB_REQUIREMENTS.md`

## Release scope

- Deliver the CADIR multi-tenant backend and Web client only. No native App client is included.
- Use SimpleCADAPI as the only canonical modeling backend and source of modeling truth.
- Require every modeling task to load the `simplecadapi` Skill before entering `CODE`.
- Allow only `Model/model.py` as the modeling entry point and require a `GraphSession`-generated canonical `Model/model.json`.
- Require every successful revision to contain Python, canonical Model JSON, STEP, STL, validation evidence, seven standard previews, GLB, topology mapping, and BRep edge data.
- Use FreeCAD as the only conversion backend. It consumes the validated canonical Model JSON and may produce `.FCStd`, a clearly labelled FreeCAD Python script, or both.
- Build only complete model Cases. A Case contains the complete immutable model package rather than a method or failure-knowledge article.
- Keep candidate Cases private from ordinary users and the main CAD Agent. Candidates require automated checks, explicit publication consent, and a human approval before publication.

## Explicit non-goals

- Native desktop or mobile App clients.
- SolidWorks conversion, workers, API contracts, UI choices, or acceptance flows.
- Fusion 360 conversion, workers, API contracts, UI choices, or acceptance flows.
- Private, team, or enterprise Case libraries.
- Method Cases, failure-knowledge Cases, and general methodology libraries.
- Automatic publication of candidate Cases.
- Browser-side BRep editing or a browser CAD kernel.

## Required invariants

1. OpenCode is an internal Agent engine. The browser communicates only with the authenticated CADIR API.
2. Every user-owned resource is authorized through the authenticated user and its owning conversation; client-provided owner, workspace, session, or storage identifiers are never trusted.
3. Every conversation has an independent persistent workspace, and every execution has an isolated disposable runtime.
4. The CAD Agent has no arbitrary shell, network, package installation, environment inspection, or unrestricted filesystem tools.
5. Geometry and QL validation complete before visual review. A visual result can never override a failed exact rule.
6. STEP is the exact exchange artifact. STL is only a mesh artifact and never an editable or BRep source of truth.
7. A candidate never enters public search or download paths before human approval.
8. A failed working copy never overwrites the latest successful revision.

## Source synchronization check

The release scope above is consistent with `CAD_AGENT_WEB_REQUIREMENTS.md`, `todo.md`, and `to_test.md`: all three specify Web-only delivery, SimpleCAD as canonical modeling, FreeCAD-only conversion, complete model Cases, and human-gated publication. Any later scope or contract change must update all three source documents in one reviewed change.
