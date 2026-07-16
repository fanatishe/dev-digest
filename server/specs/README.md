# server/specs — contracts & API specs

Authoritative shapes: the Zod contracts (`src/vendor/shared/contracts/*`), route
request/response specs, and per-lesson feature specs (L01–L08).

The code in `src/vendor/shared` is the runtime source of truth; docs here explain
*intent* and cross-route invariants that a schema alone doesn't capture.

`server/CLAUDE.md` points here with "Read when… adding or changing an API route".

Feature specs here are authored by the [`spec-creator`](../../.claude/agents/spec-creator.md)
agent (EARS acceptance criteria + boundaries; behaviour, not code). Cross-module specs live in
the top-level [`spec/`](../../spec/README.md).
