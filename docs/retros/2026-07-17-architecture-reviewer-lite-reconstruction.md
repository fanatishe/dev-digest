# Workflow retro — reconstructing the lost `architecture-reviewer-lite` agent + its A/B eval

_Date: 2026-07-17 · Run: recover a lost "lite" agent prompt from a screenshot, audit/realign its eval, then run the strict-vs-lite A/B and report the delta_

### Run shape
| # | Agent | Dispatch | Tokens | Tools | Duration | Outcome | Note |
|---|-------|----------|-------:|------:|---------:|---------|------|
| 1 | Explore — strict agent file | parallel-batch | 17.2k | 2 | ~81s | clean | Returned `architecture-reviewer.md` verbatim; confirmed no `-lite` file exists. |
| 2 | Explore — evals harness | parallel-batch | 60.2k | 29 | ~136s | clean | Mapped the whole harness; **found the eval scaffold already exists — only the lite `.md` was missing.** Highest-value return. |
| 3 | Explore — onion rules & fixtures | parallel-batch | 35.5k | 11 | ~96s | clean | **Corrected my wrong hypotheses**: `inward-only-dependencies`/`di-discipline` don't exist; real ids are `service-no-fastify`/`service-no-external-sdk`/`core-purity-no-io`. depcruise can't see a bare `new`. |

All three dispatched in a **single parallel batch** (one message, three tool calls), model inherited (read-only `Explore`). No `Workflow`, no re-dispatch, no background subagent. The rest of the session — file edits and the two `eval:repeat` runs — ran in the main loop + detached Bash jobs, not subagents.

### Cost & parallelism
- Σ subagent tokens: **112.96k** (17.2k + 60.2k + 35.5k) · Σ tool_uses: **42** (2+29+11) · Σ agent-seconds: **~313s** (81+136+96)
- Orchestrator (main-loop) tokens: **unknown** (not self-observable). `/context` late in the session showed ~183k of window *occupied*, but that conflates system prompt, tools, and message history — it is not the orchestrator's token *spend*, so it is not reported as such.
- Parallelism factor: **~2.3** (Σ 313s ÷ ~136s wall-clock `~est`, the longest agent; the batch ran concurrently) · Re-dispatches: **0** · Rework ratio: **0** · Block rate: **0/3**

### What went well
- **Clean 3-for-3 on the first (and only) fan-out.** Every agent returned well-scoped, no blocks, no clarifications, ~2.3× real concurrency. The batch was the right call: three genuinely independent search foci (agent definition / eval harness / architecture rules).
- **Agent 2 collapsed the task's scope.** It discovered the cases, both `.eval.ts` files, and all three fixtures already existed and were committed — so "reconstruct everything" became "recreate one `.md` + audit." That single fact saved the most work in the session.
- **Agent 3 overrode a wrong plan.** I had gone in assuming the screenshot's rule names (`inward-only-dependencies`, `di-discipline`) were real. Agent 3's ground-truth rule list turned the plan from "cite these ids" into "these ids are invented — realign to the real ruleset," which became Part 2 of the delivered work.

### What was hard
- **No agent struggled** — the difficulty was all in the *main loop*. I burned ~4 tool calls on faulty wait mechanics: a `Monitor` call rejected because its schema wasn't loaded, a `sleep 30 && echo` blocked by the shell guard, and several redundant `run_in_background` sleeps polling for completions that the harness already notifies on. Pure orchestration friction, zero analytical value.

### Duplication & waste
- **Minor file overlap:** agents 1 and 3 both read `.claude/agents/architecture-reviewer.md` (agent 1 in full; agent 3 only for the depcruise-invocation section). ~1 file, negligible re-grounding tax; no re-dispatch meant no from-zero re-reads.
- **Brief overlap:** agents 1 and 3 were both pointed at rule-citation wording. Acceptable — it gave two angles on the same seam.
- The real avoidable cost was the orchestrator's polling loop, not the fan-out.

### What was missed
- **No one owned the cross-join.** The load-bearing bug — the eval's practice rule-ids are invented — was invisible to any *single* agent: agent 2 held the cases' content, agent 3 held the real rule list, and only intersecting them surfaced it. I did that join by hand after the fact; had it not occurred to me, the audit would have shipped citing fake ids.
- **Runtime data hygiene was out of scope for everyone.** No agent was asked about `results/records.jsonl`. Its stale committed records (from a prior host, `/home/anatoly/…`) later corrupted the lite `eval:repeat` slice — discovered mid-run, not during exploration.
- **The always-failing "PASS/FAIL gate verdict" practices** (the agent emits `approve/request_changes`, never "PASS/FAIL") were not caught in exploration either — they sink nearly every case on *both* arms and were only visible once the eval actually ran.

### Recommendations (ranked by payoff)
1. **Probe "does this already exist?" before deep exploration.** One cheap agent (or a 30-second `find`/`git ls-files`) answering "what of this is already on disk?" would have let agents 1 and 3 be briefed more narrowly. Agent 2 found it, but only as a side effect of a broad brief. For any *reconstruction* task, make the existence-check the first, gating step.
2. **Assign the cross-join explicitly.** When two agents hold halves of a check (here: cases-content × real-rule-list), give one agent the joined mandate — "verify every rule id the cases reference actually exists in the onion ruleset." Don't rely on the orchestrator noticing the seam.
3. **Include runtime-state hygiene in an eval-recon brief.** "Is `records.jsonl` clean / are there stale label files?" would have pre-empted the pollution that forced post-hoc filtering of the delta.
4. **Fix the orchestrator wait pattern.** Load `Monitor`'s schema once up front, or use a single backgrounded `until <condition>; do sleep …; done`, instead of chained foreground sleeps (blocked) and repeated poll jobs. ~4 wasted calls this run.
