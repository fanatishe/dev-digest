# client/specs — contracts & UI specs

The client consumes the shared Zod contracts (`src/vendor/shared/contracts/*`) —
the same shapes the server serializes. Document here the UI-facing contracts:
route params, query-key conventions, and per-lesson screen specs (L01–L08).

`client/CLAUDE.md` points here with "Read when… adding a page or data hook".

Feature specs here are authored by the [`spec-creator`](../../.claude/agents/spec-creator.md)
agent (EARS acceptance criteria + boundaries; behaviour, not code). Cross-module specs live in
the top-level [`spec/`](../../spec/README.md).

