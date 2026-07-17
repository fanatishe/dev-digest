# Workflow retro — wiring the Harness evals into GitHub Actions CI

_Date: 2026-07-17 · Run: plan + implement `.github/workflows/evals.yml` (selective per-PR evals on OpenRouter), grounded in a colleague's screenshotted design_

### Run shape
| # | Agent | Dispatch | Tokens | Tools | Duration | Outcome | Note |
|---|-------|----------|-------:|------:|---------:|---------|------|
| 1 | Explore — evals harness structure | parallel-batch | 36,942 | 15 | 105.2s | clean | Mapped `evals/` layout, README tiers, `package.json` scripts, `config.ts`/`runtime`, proxy, vitest selection |
| 2 | Explore — existing CI workflows | parallel-batch | 25,808 | 11 | 82.1s | clean | Mapped `.github/workflows/*` conventions, listed skills/agents, `TESTING.md`, evals pnpm setup |

_Both launched in a single message (one parallel batch). No re-dispatches, no `Workflow`, no background Tasks (a background `bash` wait-loop was used to join them, not an agent)._

### Cost & parallelism
- Σ subagent tokens: **62,750** (observed: 36,942 + 25,808) · Σ tool_uses: **26** (15 + 11) · Σ agent-seconds: **~187s** (105.2 + 82.1)
- Orchestrator (main-loop) tokens: **unknown** (not self-observable) — but the main loop did meaningful direct work after the fan-out (4 Reads, detector dry-run, YAML parse), so its share is non-trivial here
- Wall-clock of the fan-out: **~105s** (`~est`, = max of the two parallel durations)
- Parallelism factor: **~1.78** (187 ÷ 105, `~est`) · Re-dispatches: **0** · Rework ratio: **0** · Block rate: **0/2**

### What went well
- **Clean disjoint partition.** The two agents split along a natural seam — one owned the evals *engine internals*, the other the *CI/repo conventions* + artifact inventory. Near-zero scope overlap, both returned comprehensive first-try. No agent blocked or re-dispatched.
- **Verification paid off.** Agent 1 surfaced that `evals/scripts/ci-detect.mjs` **already implements** the change-detector the colleague proposed as "Job 1" — collapsing the build from "write detector + YAML" to "write YAML only". That single find reshaped the whole plan.
- **Grounding beat the screenshots.** Rather than trust the colleague's screenshotted design outright, the agents confirmed every load-bearing claim (tiers, proxy scripts, model matrix, env switch) against real files — and caught the reuse above.

### What was hard
- Nothing blocked. The only friction was **downstream of the agents**: verifying the final YAML. No `actionlint` and no `docker` on this box, so the workflow could only be validated by a borrowed `js-yaml` from an unrelated package (`domains_wiki/crawler/node_modules`) — a structural parse, not a real Actions lint. Honest coverage gap, flagged to the user.
- One genuine design fork (agents-tier model: DeepSeek vs Gemini) couldn't be settled from files alone and correctly went to `AskUserQuestion` rather than being guessed.

### Duplication & waste
- **Low, but present in the main loop, not the agents.** After the fan-out I still directly `Read` four things the agents had already summarized or could have returned verbatim: `ci-detect.mjs` (agent 1 had described it), `package.json` scripts (agent 1 listed them), the exact README CI-template block (lines 150–260; agent 1 summarized it), and `client.yml` (agent 2 summarized the convention). These re-reads were justified — I needed exact text to author YAML — but they're a **re-grounding tax the agent briefs could have pre-paid** by asking for verbatim blocks, not summaries.
- The two agents themselves had minimal overlap (each read README/`package.json` at most once from its own angle). No cross-agent duplication worth cutting.

### What was missed
- **No true CI lint.** The YAML was never run through `actionlint` (env-context edge cases like step-level `${{ env.TOOL_MODEL }}` resolution, `fromJSON` matrix, `pull_request` base-ref diff semantics are exactly what a linter catches). Mitigated only by reasoning + a structural parse; the real proof is deferred to the first PR run.
- **Untested runtime assumption:** that `git diff origin/${{ github.base_ref }}...HEAD` resolves under `actions/checkout@v4 fetch-depth: 0`. Reasoned as correct, not exercised.

### Recommendations (ranked by payoff)
1. **When a design is handed in (screenshots/prior art), dispatch one *verification-scoped* Explore agent, not a broad map.** Brief it as "confirm these N specific claims and hunt for anything already implemented" — the highest-value output here (`ci-detect.mjs` already exists) came from exactly that instinct. A single targeted agent likely replaces the 2-agent fan-out at ~half the tokens. Est. saving: ~25–30k tokens.
2. **Ask exploring agents for verbatim blocks, not just summaries, when the deliverable is code that must match exact syntax.** Have agent 1 return the literal README CI-template YAML and the full `package.json` scripts block. That folds the 4 post-fan-out main-loop Reads into the fan-out and cuts main-loop re-grounding.
3. **Bake a lint step for the workflow itself.** Add `rhysd/actionlint` as a step in `evals.yml` (or a tiny `lint-actions.yml`) so future workflow edits self-check — closing the "no local actionlint" gap permanently instead of per-session.
4. **Keep routing open design forks to `AskUserQuestion` early.** The model/blocking questions were asked before writing YAML, so the plan committed once — zero rework. This worked; do it again.
