# onion-architecture — reliability: complex laundering case (5 runs each)

Fixture: `06-runs-module` (5 files) — a Drizzle query laundered through `presenter.ts`; clean-looking route/service.

## Detection & precision (per-run assertions, /5)

| | run1 | run2 | run3 | run4 | run5 | find-rate |
|---|---|---|---|---|---|---|
| **old** | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | **5/5 (100%)** |
| **new** | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | **5/5 (100%)** |

Both versions detected the laundered query AND traced the transitive leak in **every** run, with **zero** precision misses (repository.ts / constants.ts / routes.ts never wrongly flagged).

## Where the versions actually differ (qualitative, /5 runs)

| Signal | old | new |
|---|---|---|
| Cited a mechanical rule that catches it | 0/5 | 5/5 |
| Noted the linter blind-spot / "passes arch:check" (and asked for a rule to be added) | 3/5 | 0/5 |
| Rated the service→presenter db-handoff CRITICAL (vs WARNING) | 1/5 | 3/5 |
| Also surfaced the (unplanned) cross-module reviews/findings read | 2/5 | 1/5 |

## Cost

| | avg tokens | avg wall-clock |
|---|---|---|
| old | 42617 | 219s |
| new | 33397 | 104s |

> Detection is a **tie at 100%** — a capable model catches a Drizzle query in a presenter every time on reading. The new capability's value is **mechanical enforcement + efficiency**, not recall: the old skill can't lint this (3/5 old runs explicitly said it "stays green" and reinvented the exact rule I added), and it spent ~22% more tokens and ~2.1× the wall-clock groping toward that conclusion.
