# onion-architecture — old vs new (iteration 1)

New capability under test: **`no-cross-module-internals`** (a module must not import another module's repository).

## Aggregate

| Config | Assertions passed | Cases fully passed | Avg tokens | Avg duration |
|---|---|---|---|---|
| old_skill | 20/22 (90.9%) | 4/5 | 35346 | 74.0s |
| new_skill | 22/22 (100.0%) | 5/5 | 32810 | 63.8s |

## Per case (assertions passed)

| Case | old | new | Δ |
|---|---|---|---|
| route-db-leak | 4/4 | 4/4 | 0 |
| service-constructs-adapter | 4/4 | 4/4 | 0 |
| core-impurity | 4/4 | 4/4 | 0 |
| impure-helper | 4/4 | 4/4 | 0 |
| cross-module-reach | 4/6 | 6/6 | +2 |

> Cases 1–4 are at parity (no regression). The entire delta is in **cross-module-reach**: both versions *detected* the reach, but only the new version rated it CRITICAL and tied it to a mechanically-enforced depcruise rule; the old version rated it WARNING and noted it "passes arch:check cleanly".
