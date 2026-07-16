# reviewer-core/specs — contracts & engine specs

The engine's I/O contracts come from `@devdigest/shared` (`Review`, `Finding`,
`Verdict`). Document here the engine-level invariants that outlive any single
implementation: the grounding rule (ungrounded findings are dropped), the
deterministic score formula, and the injection-guard guarantee.

`reviewer-core/CLAUDE.md` points here with "Read when… changing engine output".

