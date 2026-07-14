# Test workspace

This directory contains cross-service integration, security, contract, deployment, and Playwright acceptance tests. Unit tests stay beside their owning module so failures have a clear owner.

Test credentials must be supplied through environment variables or the CI secret store. Test scripts must never print secret values or authorization headers.

Run `pnpm test:integration` for the deployment contract suite. After building the Runner as `cadir-runner:test`, run `pnpm test:runner-container` to verify the non-root identity, pinned SDK and Skill, read-only root filesystem, and network-disabled execution mode against a real Linux container.
