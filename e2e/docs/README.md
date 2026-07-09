# e2e/docs — deep design reference

Stable design docs for the browser e2e suite: how `run.ts` drives agent-browser,
the deterministic-locator rule, and the hermetic-stack model.

Single source of truth — `e2e/CLAUDE.md` *links* here, never copies.

> Note: this module has **no `specs/` folder** — `e2e/specs/` is reserved for the
> test-flow JSON (`NN-name.flow.json`), not documentation contracts.
