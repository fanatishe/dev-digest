# Workflow retro — SDD build of Project Context (SPEC-01), base plan + addendum + design corrections

_Date: 2026-07-17 · Run: a `/run-plan` execution of SPEC-01 (Project Context) — plan → multi-agent build → verify → accept → gate, then a re-planned addendum (content endpoint + two-pane redesign) and several design-correction rounds driven by screenshots supplied mid-run._

> **Sourcing note (read before trusting a number).** Per-agent tokens/tool-calls/duration are the
> harness `<usage>` blocks I saw when each agent returned. This session ran long and several agents
> were dispatched as the **concurrent sibling of a pair/triple**; for 7 of them the `<usage>` block
> was summarized out of my context before this retro. For those I recovered the **tool-call count**
> and transcript size from the subagent JSONL (`…/subagents/agent-<id>.jsonl`) — marked `⟲recovered`
> — but their **tokens/duration are `unknown`**. So Σ-tokens and Σ-seconds below are **observed
> lower bounds over 16 of 23 agents**, not session totals. Orchestrator (main-loop) tokens are **not
> self-observable** and are excluded entirely.

### Run shape (23 agents, 24 dispatch events)

| # | Agent / role | Dispatch | Tokens | Tools | Duration | Outcome | Note |
|---|---|---|---:|---:|---:|---|---|
| **Spec→Plan** |
| 1 | implementation-planner (base) | sync | 181k | 42 | 13m19s | clean | SPEC-01 → multi-agent plan, 5 WPs |
| **Base build** |
| 2 | implementer · WP-A contracts | parallel (w/ #3) | 115k | 32 | 5m28s | clean | both vendored copies |
| 3 | implementer · WP-C reviewer-core | parallel (w/ #2) | `unknown` | 17 ⟲recovered | `unknown` | clean | `specs` slot → `{path,body}[]` |
| 4 | implementer · WP-B server discovery | sync | 214k | 88 | 18m23s | clean | module + cols + attach; live-PG drive |
| 5 | implementer · WP-D run-executor | parallel (w/ #6,#7) | `unknown` | 61 ⟲recovered | `unknown` | clean | injection + budget + trace |
| 6 | implementer · WP-E client | parallel (w/ #5,#7) | 240k | 91 | 23m45s | clean | page + tabs + trace drawer |
| 7 | test-writer · orphan prompt-test repair | parallel (w/ #5,#6) | `unknown` | 10 ⟲recovered | `unknown` | clean | **plan gap** — WP-C broke non-owned server tests |
| 8 | implementer · nav-fix | sync | 92k | 9 | 2m24s | clean | **plan gap** — nav lives in `vendor/ui/nav.ts` |
| **Base verify + arch** |
| 9 | architecture-reviewer (base) | parallel (w/ #10) | `unknown` | 30 ⟲recovered | `unknown` | clean (advisory) | found **F1** (path label unfenced + control chars) |
| 10 | plan-verifier · source=plan | parallel (w/ #9) | 153k | 86 | 9m09s | clean · PASS | 47 DONE |
| 11 | implementer · F1 hardening | sync | 89k | 18 | 3m16s | clean | `isSafeRepoPath` rejects C0/DEL |
| **Base accept** |
| 12 | plan-verifier · source=spec (v1) | sync | 145k | 101 | 10m04s | **FAIL** | caught **AC-1** nested-root gap |
| **Addendum (re-plan)** |
| 13 | implementation-planner (addendum) | sync | 128k | 29 | 7m18s | clean | content endpoint + two-pane redesign |
| 14 | spec-creator · SPEC-01 → v2 | background | 105k | 11 | 5m38s | clean | +AC-22/23/24, AC-1/6 rewritten |
| 15 | implementer · WP0 content contract | sync | 92k | 16 | 3m17s | clean | `ContextDocContent` barrier |
| 16 | implementer · WP-A addendum (server) | parallel (w/ #17) | `unknown` | 42 ⟲recovered | `unknown` | clean | nested-root walk + content endpoint + AC-3 |
| 17 | implementer · WP-B addendum (client) | parallel (w/ #16) | 189k | 65 | 16m24s | clean | redesign **+ fixed Bug A/Bug B** |
| **Addendum verify + accept** |
| 18 | architecture-reviewer (addendum) | parallel (w/ #19) | `unknown` | 27 ⟲recovered | `unknown` | clean (advisory) | found **A1** (excluded-dirs) + **A2** (symlink) |
| 19 | plan-verifier · source=spec (v2) | parallel (w/ #18) | 147k | 93 | 9m00s | **FAIL** | caught **AC-6** tokens/path gap |
| 20 | implementer · A1+A2 server fix | parallel (w/ #21) | 96k | 25 | 4m56s | clean | `EXCLUDED_DIRS` + realpath confinement |
| 21 | implementer · AC-6 client fix | parallel (w/ #20) | `unknown` | 19 ⟲recovered | `unknown` | clean | tokens + path in preview pane |
| **Design corrections (from screenshots)** |
| 22 | implementer · border bug + eye-drawer | sync | 149k | 64 | 11m03s | clean | restored `DocPreviewDrawer` for both tabs |
| 23 | implementer · SERIALIZES-AS + row cosmetic | sync | 129k | 44 | 10m54s | **blocked** | out-of-scope stale assertion in `AgentEditor.test` |
| 23b | ↳ resume (SendMessage) · one-line test fix | continuation | 171k | 3 | 1m05s | clean | scope extended by 1 file → 151 tests green |

_Launch topology: mostly serial phases with concurrent fan-out **within** phases — pairs (#2∥#3, #9∥#10, #16∥#17, #18∥#19, #20∥#21) and one triple (#5∥#6∥#7). No two concurrent agents shared an owned path; the plan's `Owns` globs held all session._

### Cost & parallelism
- **Σ subagent tokens (observed, 16 of 23 agents): ~2.43M.** Arithmetic: 181+115+214+240+92+153+145+89+128+105+92+189+147+96+149+129+171 (k) = 2,432,938. **7 agents' tokens are `unknown`** (rows #3,5,7,9,16,18,21).
- **Σ tool_uses (all 23 agents): 1,023** = 817 (observed blocks) + 206 (⟲recovered: 17+61+10+30+42+27+19).
- **Σ agent-seconds (observed subset): ~9,321s ≈ 2.6h** of agent compute; **+7 agents unobserved** → true total is higher.
- **Orchestrator (main-loop) tokens: unknown** (not self-observable). Context window peaked at ~394k/1M by session end, but that is window size, not cumulative spend.
- **Parallelism factor: not meaningfully computable.** Wall-clock by file mtimes ≈ 00:45→09:13 (~8.5h), but that window is dominated by **human-in-the-loop gaps** (10 `AskUserQuestion` seams, screenshot drops, `/clear`, `/context`), not agent compute (~2.6h observed). Concurrency was real *within* phases but the run was phase-serial and interaction-gated, so a single factor would mislead. `~est`.
- **Re-dispatches: 1** (row 23b — a continuation, not a fresh re-run). **Block rate: ~4%** (1/23). **Rework ratio ≈ 0** — no deliverable was produced and thrown away.

### What went well
- **First-try clean dominated: 22/23 agents returned clean**, one block resolved by a 3-tool-call resume. The disjoint-ownership model held — no parallel collisions across the whole run.
- **The read-only verifier layer earned its cost.** `plan-verifier(source=plan)` passed, then `plan-verifier(source=spec)` caught **two real gaps the plan-run structurally could not see** — AC-1 nested-root at base Accept, AC-6 tokens/path at addendum Accept. `architecture-reviewer` caught **three real security/correctness issues tests missed** — F1 (control-char injection), A1 (dependency-dir pollution), A2 (symlink escape). Verify→Accept→arch did exactly its job.
- **Resume-via-`SendMessage`** for the one-line out-of-scope test fix (row 23b) was far cheaper than a cold re-dispatch — the agent kept its context and touched exactly one authorized file.
- **Background spec-creator** (row 14) overlapped a code build with zero contention (disjoint `spec/**`).

### What was hard
- **Runtime bugs were invisible to the test harness — the user caught them.** Bug A (Context tab dead because the parent `VALID_TABS` allowlist coerced `?tab=context`→`config`) and Bug B (`MISSING_MESSAGE: shell.nav.project-context`) both passed every mocked-`fetch` RTL suite. No Docker meant I could never drive the real app, and every `*.it.test.ts` DB lane self-skipped all session — so the human running the UI was the only detector.
- **Plan gaps surfaced late.** Three separate patch dispatches (orphan prompt tests #7, nav location #8, AC-6 completeness #21) existed only because the base plan under-specified boundaries a real-file grep would have exposed.
- **One correct block** (#23): a row-cosmetic that split a path into two DOM nodes broke a *parent-level* test the WP didn't own; the agent stopped rather than reach out of scope, needing orchestrator authorization.

### Duplication & waste
- **Re-grounding tax on one feature surface.** The client Project-Context code was read from zero by ~6 separate agents (#6 WP-E, #17 addendum redesign, #21 AC-6, #22 eye-drawer, #23 serializes, 23b) plus #8 nav-fix; the server module by 3 (#4, #16, #20). Sequential same-surface fixes as cold starts repeatedly re-paid for reading `ProjectContextView`/`ContextTab`.
- **Design arrived after planning — the dominant avoidable cost.** The entire addendum (rows 13–21, ~5 build agents) and the three design rounds (22, 23, 23b) exist because the two-pane page, the eye-drawer, the SERIALIZES-AS panel, and the WORKSPACE nav placement were **not** in the base spec/plan — they came from screenshots dropped mid-run. AC-6's body preview was even explicitly **deferred, then reversed**. This one late-input pattern accounts for roughly half the run.

### What was missed
- **`[NEEDS CLARIFICATION]` in spec v2** (nested-root-*within*-a-root labelling) — unresolved, unowned.
- **Runtime/visual verification never ran** (no Docker) — handed to the user; the retro cannot attest the UI actually matches the screenshots.
- **Pre-existing vendored-shared drift** (`trace.ts`/`knowledge.ts`, server vs client) was flagged by **two** verifiers and floated with no owner or won't-fix decision.
- **Orchestrator token cost is unaccounted** — the ~2.43M subagent floor omits both the 7 unobserved agents and all main-loop dispatch/summarize overhead.

### Recommendations (ranked by payoff)
1. **Ground UI-heavy specs on the real design artifacts (screenshots/Figma) BEFORE planning.** The screenshots existed; attaching them to the spec/plan up front would have made the two-pane page, eye-drawer, SERIALIZES-AS panel and nav placement **base WPs**, eliminating the addendum (~5 build agents), the 3 design rounds, and the AC-6 defer/reverse churn. _Est. saving: ~8 dispatches, well over 1M subagent tokens._
2. **Make the planner enumerate the real call-sites and non-owned files each WP will perturb.** All three late patches (#7,#8,#21) were catchable by grepping actual callers of the changed contract and the nav registry at plan time. Add a per-WP "shared / non-owned files touched" section. _Est. saving: 3 patch dispatches + their re-grounding._
3. **Batch sequential same-surface fixes into one warm dispatch instead of cold re-runs.** Where fixes are ordered and hit the same files (AC-6 → eye-drawer → serializes), continue **one** implementer (à la row 23b) rather than 3 fresh agents. _Est. saving: 2–3 cold client re-reads._
4. **Stand up a runtime smoke for UI work early — and treat the missing-Docker environment as a first-class gap.** Both user-caught bugs are structurally invisible to mocked-`fetch` RTL; a single real app-drive, or a test that mounts the real router + i18n provider, catches the tab-coercion and missing-message classes before the user does.
5. **Close every advisory/drift note at its seam** — assign the vendored-shared drift and the spec `[NEEDS CLARIFICATION]` an owner or an explicit won't-fix, rather than letting them float across phases.
