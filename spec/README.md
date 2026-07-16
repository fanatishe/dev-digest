# spec — cross-module specifications only

This top-level surface holds **feature specs whose behaviour genuinely spans two or more
packages** (server · client · reviewer-core · mcp) and that no single module owns — a contract
or workflow *between* services. A spec that lives in one module, even if other modules read its
output, belongs in that module's `specs/`, not here.

- **Owned by** the [`spec-creator`](../.claude/agents/spec-creator.md) agent — the only agent
  that writes any `specs/**` or `spec/**` path. It writes EARS acceptance criteria (testable,
  unambiguous), boundaries, cross-module contracts (shapes only, no code), and diagrams —
  never implementation.
- **Not for** single-module feature specs → `<module>/specs/`. Not for the months-long
  product/architecture backbone → `docs/` (`doc-writer` / a human). Not for build plans →
  `docs/plans/` (`implementation-planner`). Not for e2e flows → `e2e/specs/*.flow.json`
  (`test-writer`).

Files are named `SPEC-NN-<slug>.md`. Each is the input to `implementation-planner`, which plans
against it and traces every `AC-N` back here.
