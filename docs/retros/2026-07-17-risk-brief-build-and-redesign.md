# Workflow retro — Risk Areas (Why+Risk Brief): full SDD build, then redesign

_Date: 2026-07-17 · Run: spec → plan → multi-agent SDD build → verify → gate of an **LLM** Risk
Brief, which the user's design review then reverted to a **findings-derived, no-LLM** feature;
followed by a 3-agent Explore sweep that grounded the inline redesign._

### Run shape
| # | Agent | Dispatch | Tokens | Tools | Duration | Outcome | Note |
|---|-------|----------|-------:|------:|---------:|---------|------|
| 0 | spec-creator | sync | — | — | — | cancelled | dispatched before the user added screenshots; rejected, never ran |
| 1 | spec-creator | sync | 124.4k | 26 | ~7m28s | clean | SPEC-02 written + 3-question CLARIFICATION_NEEDED |
| 2 | spec-creator | resume (SendMessage) | 161.2k | 31 | ~4m09s | clean | revised spec with the 3 answers (context-folder=all, card placement, name `RiskBrief`) |
| 3 | implementation-planner | sync | 184.6k | 42 | ~16m54s | clean | multi-agent plan, WP0→WP1∥WP2, resolved 4 markers |
| 4 | implementer · WP0 | sync | 102.2k | 17 | ~3m51s | clean → **reverted** | shared `RiskBrief` contract (both vendored copies) |
| 5 | implementer · WP1 | parallel-bg | 377.3k | 87 | ~4m11s | clean → **reverted** | server brief module + migration; **interrupted by process exit, resumed** |
| 6 | implementer · WP2 | parallel-bg | 252.0k | 60 | ~2m34s | clean → **reworked** | client RiskAreas/ReviewFocus + hooks; **interrupted, resumed** |
| 7 | architecture-reviewer | parallel-bg | 90.9k | 22 | ~4m11s | clean | `approve`, 0 new violations — on code later discarded |
| 8 | plan-verifier | parallel-bg | 127.5k | 52 | ~4m58s | clean | PASS, 19 ACs traced — against a plan that encoded the wrong interaction model |
| 9 | Explore · findings model | parallel-sync | unknown | unknown | unknown | clean | (foreground Explore returns carried no `<usage>` block) |
| 10 | Explore · current brief code | parallel-sync | unknown | unknown | unknown | clean | inventory of what to revert/rework |
| 11 | Explore · client interaction patterns | parallel-sync | unknown | unknown | unknown | clean | accordion + `onOpenFile` deep-link patterns |

Gate (`pr-self-review`), the whole design-fix implementation, and the two layout follow-ups ran in
the **main loop** (no subagents) — their tokens are part of the unobservable orchestrator share.

### Cost & parallelism
- Σ subagent tokens (observed, 8 agents): **1,420,152 (~1.42M)** = 124.4k+161.2k+184.6k+102.2k+377.3k+252.0k+90.9k+127.5k. Three Explore agents: **tokens unknown** (no usage surfaced).
- Σ tool_uses (observed): **337** (+3 Explore unknown) · Σ agent-seconds (observed): **~2,897s (~48m)**.
- Orchestrator (main-loop) tokens: **unknown** (not self-observable) — and large here: the entire
  redesign implementation was done inline, not delegated.
- Wall-clock: **unknown / not meaningful** — the run spanned multiple human-interaction gaps, a
  process restart, and a fresh session, so agent-seconds ≠ elapsed. Real concurrency occurred in
  **three parallel batches**: WP1∥WP2, arch-reviewer∥plan-verifier, and Explore×3; every other phase
  was serial.
- Re-dispatches: **0 true re-runs** (2 resumes were interruption-recovery, 1 was the intended
  clarification loop, 1 dispatch was cancelled pre-run). **Rework ratio ≈ 0.7–0.8** — see below.

### What went well
- **Clean disjoint fan-out.** WP1∥WP2 shared no owned paths and never collided; the WP0→{WP1∥WP2}
  ordering (serial contract, then parallel surfaces) held exactly as planned.
- **Parallel read-only verify.** arch-reviewer∥plan-verifier ran concurrently and independently
  corroborated the same pre-existing baseline (the `reviews.ts` shared-table false-positive), which
  made triage trustworthy.
- **Interruption recovery without rework.** When the process exited mid-build, WP1 & WP2 writes were
  already on disk; detecting the partial state and **resuming via SendMessage** (not re-dispatching
  fresh) finished them with zero lost work and no re-grounding tax.
- **The clarification loop worked as designed.** spec-creator returned a blocking block, it was
  relayed verbatim, and the resume folded the answers in — no fresh agent, context preserved.
- **The 3-agent Explore sweep was the right tool for the redesign** — parallel, read-only, and it
  produced enough grounding (data model + current code + interaction patterns) to do the whole fix
  inline with confidence and no further agents.

### What was hard
- **Process exit mid-build** left WP1 & WP2 with no completion records; recovery required inspecting
  the working tree to confirm what had landed before resuming.
- **DB-backed `.it.test.ts` could not execute** (no Docker) — WP1's AC-2/3/5/7/8/18 stayed
  verified-by-source, not by run. Then the whole module was reverted anyway.
- **Full-branch gate noise.** `pr-self-review` surfaced 7 CRITICALs that were all pre-existing
  baseline or scanner false-positives; separating them from feature findings was manual.

### Duplication & waste
- **The headline: a complete SDD cycle built a feature that was then almost entirely discarded.**
  spec (2 runs) + plan + WP0 contract + WP1 server + WP2 client + arch-review + plan-verify + gate —
  **~1.42M observed subagent tokens** — produced an **LLM** Risk Brief (`POST /brief`,
  `completeStructured`, `pr_brief` cache, "Generate brief" button). The user's design review then
  reverted WP0 + WP1 in full, reworked WP2, and superseded the spec + plan. **~1.2M of the ~1.42M was
  effectively thrown away**; only WP2's component/test scaffolding (~10–15%) survived into the
  findings-derived redesign.
- **Validation spent on discarded work.** arch-reviewer (91k) + plan-verifier (128k) + the gate ran
  clean against code that no longer exists — ~220k+ tokens confirming the wrong thing was built
  correctly.
- **The plan-verifier gave *false confidence*:** it traced all 19 ACs to evidence and returned PASS —
  but the plan itself encoded the wrong interaction model (LLM + generate button), so a green verify
  said nothing about design-correctness.

### What was missed
- **The core question was never asked at spec time: "is this a new LLM call, or a deterministic
  projection of already-computed findings?"** The user's own framing — *"almost free because it
  gathers what has already been built previously"* — pointed hard at the latter, yet the spec took
  *"one structured call → Brief"* from the written requirement and built an LLM feature. The 3
  clarifications that *were* raised (context-folder selection, card placement, contract naming) were
  all downstream of that unexamined assumption.
- **The screenshots were read for layout, not for absence.** No agent asked "there's no generate
  button and the data is just present — where does it come from?" — the exact divergence the user
  later flagged.
- **No cheap visual checkpoint before the full build.** The interaction model (accordion vs inline,
  auto vs generate, findings vs LLM) was only reality-checked when the user viewed the *running*
  feature — after build+verify+gate.

### Recommendations (ranked by payoff)
1. **At spec time, when a feature is framed as reusing existing artifacts, make "does this need an
   LLM call at all?" a BLOCKING clarification.** Trigger phrase: *"almost free / gathers what's
   already built."* One question here would have avoided ~1.2M tokens of build+verify on a design
   that was discarded. By far the highest payoff.
2. **Interrogate design mockups for *absence*.** A populated card with no generate/empty affordance
   is a spec signal: "how is this populated, and is there a generation control?" Add "data source +
   interaction model" to the spec-creator's screenshot checklist, alongside layout.
3. **Add a pre-build visual/interaction checkpoint for UI features** — render or click the target
   card (even against mock data) to confirm the interaction model *before* dispatching implementers.
   Minutes of check vs a full build→verify→gate→revert.
4. **Make Accept verify against the design, not only the plan.** plan-verifier confirms code-matches-
   plan; it cannot catch a plan that encodes the wrong behaviour. For UI work, pair it with an
   explicit "matches the screenshots' interaction model" check.
5. **Feed the spec-creator the screenshots as the *primary* source when they exist**, with written
   requirements secondary — here the prose (*"one structured call"*) over-rode the visual truth
   (no button, findings-sourced).
6. **Checkpoint the tree before long parallel background dispatches** (the standing "commit/stash
   before implementers" note) — recovery from the process exit worked, but a checkpoint would make
   it trivial rather than investigative. Minor; recovery succeeded.
```
