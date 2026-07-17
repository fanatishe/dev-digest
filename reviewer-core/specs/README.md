# reviewer-core/specs — contracts & engine specs

The engine's I/O contracts come from `@devdigest/shared` (`Review`, `Finding`,
`Verdict`). Document here the engine-level invariants that outlive any single
implementation: the grounding rule (ungrounded findings are dropped), the
deterministic score formula, and the injection-guard guarantee.

`reviewer-core/CLAUDE.md` points here with "Read when… changing engine output".

Feature specs here are authored by the [`spec-creator`](../../.claude/agents/spec-creator.md)
agent (EARS acceptance criteria + boundaries; behaviour, not code). The engine invariants above
— `groundFindings()` and `wrapUntrusted()` — are **fixed**: a spec may rely on them but never
restate or override them. Cross-module specs live in the top-level [`spec/`](../../spec/README.md).

