# workflow-retro — evaluation dimensions & data-source cheatsheet

The `SKILL.md` method describes the run. This file is the menu for *grading* it. Pull in a
dimension only when it earns its keep — a retro that scores twelve axes nobody reads is its own
kind of waste. Everything here still obeys the cardinal rule: **only score what you can observe;
mark the rest `unknown`.**

## Data-source cheatsheet

| Artifact | Where | What you get |
|---|---|---|
| Subagent spawn result | the transcript, inline under each `Agent`/`Task` call | `agentId`, final report text, and `<usage>subagent_tokens · tool_uses · duration_ms</usage>` |
| Workflow run | the `Workflow` tool result | `runId`, `scriptPath`, `transcriptDir` |
| Workflow journal | `<transcriptDir>/journal.jsonl` | one line per `agent()` call: its label, order, and **actual return value** (read this before diagnosing an empty/odd result) |
| Per-agent workflow log | `<transcriptDir>/agent-<id>.jsonl` | a single agent's full turn-by-turn transcript |
| Background / queued agents | `TaskList` → `TaskGet` / `TaskOutput` | status, and the agent's output when done |
| Model pricing | `claude-api` skill (only if you need $ figures) | per-model input/output token price |

`Date.now()` / wall-clock is **not** readable from a workflow script and there is no clock tool in
the loop — derive elapsed time from durations and label it `~est`.

## Evaluation dimensions to grow into

### 1. Output quality vs cost (the core trade)
Score each agent's *result* — did it deliver what was asked, verified? — against its token cost.
The interesting cell is **high cost / low value**: an agent that burned 100k tokens to return a
report that was superseded or blocked. Cheap catch: `subagent_tokens` ÷ (was the output used?).

### 2. Rework & re-grounding tax
Re-dispatches dominate waste in practice. For each re-run of a role, estimate the tokens spent
re-reading context the previous run already had (fresh agents re-ground from zero). Recommendation
this surfaces: **pass prior grounding forward** (hand the new agent the earlier findings) or prefer
a **resumable** agent over a fresh spawn.

### 3. Agent-selection fit
Did each task go to the right agent type? A `general-purpose` agent doing what a specialized one
(`spec-creator`, `investigator`) does better, or a heavyweight model on a mechanical task, is a
selection miss. Signal: outcome quality vs the agent's declared purpose.

### 4. Dispatch-topology efficiency
Was the fan-out shaped well? Serial chains that could have been a parallel batch (low parallelism
factor with independent tasks), or a barrier that idled fast agents waiting on a slow one. Signal:
parallelism factor + whether sequential steps had real data dependencies.

### 5. Prompt-clarity / blocking signals
A high **block rate** (agents returning `CLARIFICATION_NEEDED`) or re-asked questions points at
under-specified dispatch prompts, not bad agents. Signal: blocks ÷ agents, and questions that were
already answered upstream but got asked again.

### 6. Coverage & duplication (the two-sided check)
- **Duplication**: the same files read by N agents, overlapping searches, the same fact re-derived.
- **Coverage gaps**: a surface (module, modality, edge case) no agent touched, or a load-bearing
  claim no one verified. A completeness-critic pass ("what's missing?") turns gaps into next work.

### 7. Verification depth
Were findings/claims adversarially checked, or taken on first assertion? A run that produced results
but never verified them scores lower than a cheaper run that did. Signal: presence of a verify/critic
stage; claims with a cited source vs bare assertions.

### 8. A lightweight scorecard (optional)
When the user wants a single grade, score 4–6 chosen dimensions 1–5, **state the weights first**,
then the weighted total — the same discipline the `brainstorm` agent uses. Never a vibe score:
every number cites the observed evidence behind it. Keep it to the dimensions that changed a
decision; drop the rest.

## Recommendation quality bar

A retro recommendation is only useful if it is **a change the orchestrator can make next time**:
- Good: "batch the three independent reviewers into one parallel dispatch — they had no data
  dependency; ~2× wall-clock saving."
- Good: "re-dispatched `spec-creator` 3×, each re-grounding from zero (~220k tokens); resume the
  same agent or feed it the prior grounding — est. ~140k saved."
- Weak: "communicate better", "be more efficient" — not actionable, cut it.
