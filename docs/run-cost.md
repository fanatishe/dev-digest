# Spec — Run Cost across three screens

Surface the **USD cost of agent review runs** in three places: the Pull Requests
list (a COST column), the PR agent-runs timeline (price next to the launch time),
and the run-trace sidebar Stats panel (a COST card).

The cost data **already exists** — `reviewer-core` computes `costUsd` per run from
OpenRouter's real `usage.cost` (`reviewer-core/src/review/run.ts`), falling back to
an estimate. It is currently **discarded**: `run-executor.ts` destructures only
`{ tokensIn, tokensOut, grounding }` and never persists cost. This feature captures
that value, persists it, exposes it in two contracts, and renders it in three UIs.
**Zero additional model calls.**

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | PR-list COST column semantics | **Sum of all runs** on the PR (`SUM(cost_usd) GROUP BY pr_id`) |
| D2 | Runs with no reported cost | **Show partial cost** whenever any cost was captured; render `—` only when `cost_usd IS NULL` (never `$0.00`) |

## Data flow (target)

```
reviewer-core run() ──outcome.costUsd──► run-executor.ts ──► agent_runs.cost_usd (NEW column)
                                                          └─► run_traces.trace.stats.cost_usd (NEW field)
                   ┌──────────────────────────┬───────────────────────────┐
             RunSummary.cost_usd        RunStats.cost_usd            PrMeta.cost_usd
             (listRunsForPull)          (trace doc)                  (SUM rollup, pulls route)
                   │                          │                           │
          Screen 2: RunHistory        Screen 3: TraceBody         Screen 1: PRRow
          "N tok · $0.0013"           Stats "COST" card "$0.06"   list COST column "$0.014"
```

## Server (`@devdigest/api`)

- **Schema** (`server/src/db/schema/runs.ts`) — add `costUsd: real('cost_usd')` to
  `agentRuns` (nullable). New column only — never edit the shared-table migrations.
  `real` is sufficient (display-only money; the D1 SUM tolerates float).
- **Persistence** (`server/src/modules/reviews/`):
  - `run-executor.ts` — read `costUsd` from `outcome`; pass it to the completion
    path and write `cost_usd: costUsd` into the trace `stats` object.
  - `repository/run.repo.ts` — `completeAgentRun` gains `costUsd` in its `values`
    and `.set(...)`. Persisting whatever `outcome.costUsd` holds satisfies D2's
    partial-cost rule for free; a hard LLM throw yields no usage and stays `null`.
  - `repository/run.repo.ts` — `listRunsForPull` maps `cost_usd: run.costUsd`.
- **PR-list rollup** (`server/src/modules/pulls/routes.ts`) — mirror the latest-review
  SCORE rollup: one `IN`-query summing cost per PR
  (`sum(agentRuns.costUsd) ... groupBy(prId)`); add `cost_usd` to each `PrMeta`.
- **Contracts** (`server/src/vendor/shared/contracts/`) — `@devdigest/shared` is
  copy-vendored, so mirror every edit into `client/src/vendor/shared/contracts/`:
  - `trace.ts` — `RunStats` and `RunSummary` each gain `cost_usd: z.number().nullable()`.
  - `platform.ts` — `PrMeta` gains `cost_usd: z.number().nullish()` (list-only,
    absent until a run exists — matches the existing `score` pattern).

## Client (`@devdigest/web`)

- **Shared formatter + `RunCostBadge`** — `formatCost(n)` (`src/lib/format-cost.ts`)
  → `n == null ? "—" : "$" + <compact>`: 4-dp precision with trailing zeros trimmed
  to a 2-dp floor (`0.0013 → $0.0013`, `0.06 → $0.06`, `0.2 → $0.20`). One helper is
  the single source of the `—`-not-`$0.00` rule; a genuine `0` still renders `$0.00`.
  `RunCostBadge` (`src/components/RunCostBadge/`) is the shared inline badge for the
  list cell + timeline suffix — it inherits the caller's text colour (normal in the
  list, muted in the timeline) and forces muted only on the empty dash. The sidebar
  reuses the existing `<Stat>` atom with `formatCost` for visual parity with its
  sibling Duration/Tokens/Findings cards.
- **Screen 1 — PR list COST column** (`_components/PRRow/PRRow.tsx`, ns `prReview`):
  add a cost cell (after STATUS, before UPDATED) rendering `formatCost(pr.cost_usd)`;
  add the column to `page.tsx` header + `pulls/styles.ts` grid template; i18n
  `messages/en/prReview.json` → `list.col.cost`.
- **Screen 2 — agent-runs timeline** (`_components/RunHistory/RunHistory.tsx`, ns
  `prReview`): under the `ran_at` timestamp, add a muted line
  `{formatTokens(tokens_in, tokens_out)} · {formatCost(cost_usd)}`.
- **Screen 3 — run-trace sidebar Stats** (`RunTraceDrawer/_components/TraceBody/
  TraceBody.tsx`, ns `runs`): add a fourth Stat card
  `<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />`; i18n
  `messages/en/runs.json` → `trace.stat.cost`.

## Testing (one suite per package, path-filtered)

- **server unit** — `run.repo` mapping includes `cost_usd`; the pulls-route SUM
  rollup groups correctly (two runs on one PR → summed; a null-cost run → excluded).
- **server `.it.test.ts`** — after a completed run, `agent_runs.cost_usd` is
  populated and `GET /repos/:id/pulls` returns the summed `cost_usd`.
- **client** — `RunHistory.test.tsx`, `TraceBody.test.tsx`, and a `formatCost`/`PRRow`
  test all assert `—` for null and the formatted value otherwise.

## Out of scope / risks

- **No backfill** — historical `agent_runs` predate the column and render `—`.
- **D1 growth** — sum-of-all-runs means a re-run increases a PR's list cost (intended).
- **Vendored-shared duplication** — an edit to `server/src/vendor/shared` not mirrored
  into `client/src/vendor/shared` yields silent type drift; do both in the same step.
