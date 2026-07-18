# onion-architecture — evals

Behavioral detection evals for the `onion-architecture` skill. They measure whether
Claude, reviewing DevDigest backend code, catches planted boundary violations —
and how much the skill adds over baseline Claude in this repo.

Ships **inside the skill folder** so it travels with the skill when delivered.

```
evals/
├── evals.json     # test cases: prompt + fixture files + assertions (the answer key, as checks)
├── ANSWER_KEY.md  # human-readable list of every planted violation + the decoys
├── README.md      # this file
├── benchmarks/    # dated result summaries, one per run — stack over time
└── fixtures/      # DevDigest backend files under review — NO marker comments, by design
    ├── 01-pulls-route/       routes.ts leaks Drizzle into the HTTP ring
    ├── 02-repos-service/     service.ts `new`s adapters instead of using the DI container
    ├── 03-core-run/          reviewer-core reaches for Postgres + Octokit
    ├── 04-agents-module/     impure helpers.ts beside a clean routes.ts (precision test)
    ├── 05-reviews-service/   reaches into another module's repository (cross-module) †
    └── 06-runs-module/       a Drizzle query laundered through a presenter.ts (5 files) †
```

`benchmarks/` holds dated result summaries (e.g. `2026-07-17-*.md`) from past runs,
kept alongside the suite so results accumulate. Transient run transcripts are not
committed.

† Cases 05–06 target boundary rules (`no-cross-module-internals`,
`db-toolkit-only-in-repository`) that were **prototyped and measured but are not in
the currently shipped skill** — the fixtures are kept as ready-made tests for if/when
those rules are adopted. See the dated benchmarks for the measured old-vs-new deltas.

## What each eval checks

Every case is scored on **recall** (did it catch the planted violations?) and, where
a decoy is present, **precision** (did it leave the correct code alone?). See
`ANSWER_KEY.md` for the full per-fixture list.

| # | Fixture | Planted rule(s) | Decoy (must NOT flag) |
|---|---|---|---|
| 1 | pulls route | `routes-no-db` | Zod schemas / status codes |
| 2 | repos service | `service-no-external-sdk`, depend-on-interface | `new RepoRepository(container.db)` |
| 3 | core run | `core-purity-no-io` (DB + GitHub) | injected `LLMProvider`, pure prompt/score |
| 4 | agents module | `helpers-must-stay-pure` | pure DTO map, constant, clean `routes.ts` |
| 5 † | reviews service | `no-cross-module-internals` | own `ReviewRepository`, container, core call |
| 6 † | runs module | `db-toolkit-only-in-repository` (laundered I/O) | correct `repository.ts`, constants, clean route |

## Running

The suite is executed with the **skill-creator** harness (with-skill vs baseline
subagents, then grading + a dated `benchmarks/` summary). From a session with
skill-creator:

> run the onion-architecture evals

Assertions in `evals.json` are graded from the review text, so grading is
deterministic given a run's output — which is what makes the suite CI-ready.

## Adding a case

1. Add a fixture folder under `fixtures/` — realistic code, **no comments naming the
   problem**. Include a decoy (correct code) where it sharpens precision.
2. Record the planted violations in `ANSWER_KEY.md`.
3. Add an entry to `evals.json`: `prompt`, `files`, `expected_output`, and
   `assertions` (each objectively checkable from the review text).
