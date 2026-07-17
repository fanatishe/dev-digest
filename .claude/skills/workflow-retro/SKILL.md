---
name: workflow-retro
description: >-
  Post-run retrospective over a multi-agent / workflow session. Reconstructs the run —
  which agents were launched, in what order, sync vs parallel vs background, and each one's
  tokens, tool calls, duration and outcome — then aggregates cost and parallelism and mines
  the agents' own reports for what was hard, what was easy, what work was duplicated
  (re-grounding, overlapping file reads, re-asked questions) and what was missed (leftover
  clarifications, coverage gaps). Ends with ranked, concrete recommendations for running the
  next similar workflow cheaper and cleaner. Read-only analysis that writes only a retro report —
  persisted to docs/retros/<date>-<slug>.md and summarized in-conversation — never product source, never commits.
  Runs in the main conversation because that is the only place the dispatched agents' usage
  blocks, agentIds and workflow journals are visible. MANUAL ONLY — invoke exclusively when the
  user explicitly asks; never run it proactively, automatically, or at session end. Trigger terms:
  /workflow-retro, workflow retro, retro, retrospective, post-mortem, how did that run go,
  evaluate the workflow, analyze the agent run.
metadata:
  tags: retro, workflow, orchestration, multi-agent, evaluation, meta
allowed-tools: Read, Grep, Glob, Bash, Write, TaskList, TaskGet, TaskOutput, Skill
---

# workflow-retro — retrospective over a multi-agent run

After a session that fanned work out across subagents or a `Workflow`, this skill turns the run
into a **retro**: what it cost, how it was shaped, where it struggled, what it duplicated, what it
missed, and what to change next time. It evaluates the **run**, not the code.

You run **in the main conversation** on purpose: the per-agent `<usage>` blocks, the `agentId`s,
the dispatch order, and any workflow journal are only visible to the orchestrator that launched
them. A subagent cannot see its siblings; only you saw the whole run.

This skill is **read-only + one report**. It never edits product source, specs, plans, or existing
docs (its sole write is the retro file under `docs/retros/`, plus a link line in that folder's
`README.md`), and it never commits. It is **not** [`engineering-insights`](../engineering-insights/SKILL.md) — that
captures durable *code* learnings into a module's `INSIGHTS.md`; this evaluates *one orchestration*.
A process learning worth keeping across sessions can be handed to `engineering-insights` after, but
that is a separate step.

## When to apply

**Manual only — this skill never runs on its own.** Invoke it *exclusively* when the user asks for
it, in words or as `/workflow-retro`. Do **not** trigger it proactively, do **not** run it as part
of wrapping up, and do **not** fire it at session end (that is `engineering-insights`' job, not
this one). A finished multi-agent run is *not* a signal to run a retro — only a user request is.

When the user does ask:

- It fits best right after a run that launched **≥2 subagents**, a re-dispatched agent, or a
  `Workflow` — but the user decides that, not you.
- If they ask for a retro after a single-agent or purely conversational turn, say there is no
  topology to analyze rather than manufacturing one.

## What you can actually observe — and what you must not invent

A retro is only as trustworthy as its numbers. **Label every metric by its source; never fabricate
a total to look complete.** The honest sources, in order of reliability:

| Want | Source (in the main loop) | Reliability |
|---|---|---|
| Which agents ran, in what order | The transcript — each `Agent`/`Task` spawn result, top-to-bottom | **observed** |
| Per-agent tokens · tool_uses · duration | The `<usage>subagent_tokens · tool_uses · duration_ms</usage>` block on each spawn result | **observed** |
| An agent's outcome + what it struggled with | The agent's returned report text (and its "what I could not find" section, if any) | **observed** |
| True launch order + per-agent returns in a `Workflow` | `journal.jsonl` in the run's transcript dir; `agent-<id>.jsonl` per agent; the `runId` from the tool result | **observed** (Read it) |
| Background/queued agents still tracked | `TaskList` → `TaskGet` / `TaskOutput` | **observed** |
| Σ subagent tokens / tool_uses / agent-seconds | Sum the per-agent blocks you can see | **derived** |
| **Orchestrator (main-loop) tokens** | Not self-observable from inside the loop | **UNKNOWN — mark it so** |
| Wall-clock elapsed | Not directly readable (`Date.now()` is unavailable in workflow scripts; the loop has no clock tool) | **estimate from durations, label `~est`** |
| $ cost | Only if you know the model's price AND the token counts; else omit | **derived or omit** |

Rule: if a number is not in front of you, write `unknown` or `~est` — a retro that guesses a
session-token total is worse than one that says the orchestrator's share was not observable.

## Method

1. **Reconstruct the timeline.** Walk the transcript in order and list every subagent, `Workflow`,
   and background `Task` launched. If a `Workflow` ran, `Read` its `journal.jsonl` for the exact
   per-agent order and returns rather than eyeballing. Record, per launch, the row fields below.
   Mark **re-dispatches** explicitly — the *same role launched again* is a re-run; capture *why*
   (blocked, superseded, fresh-context edit). Re-dispatches are the loudest waste signal.
2. **Aggregate.** Compute the derived metrics below from the observed rows. Show your arithmetic
   (e.g. "Σ = 110k + 58k + 51k"). Leave the orchestrator share as `unknown`.
3. **Mine the reports.** Read each agent's returned text for: difficulties and dead-ends, explicit
   "could not find" gaps, blocking (`CLARIFICATION_NEEDED` / `[NEEDS CLARIFICATION]`), and the clean,
   confident completions. Cross-agent, look for **duplication**: the same files read by several
   agents, grounding re-done from scratch by a re-dispatched agent, questions re-asked that were
   already answered upstream.
4. **Assess what was missed.** Leftover clarification markers, unverified load-bearing claims,
   coverage holes (a module/modality/edge case no agent touched), decisions made with no owner.
5. **Recommend.** Turn each waste/gap into a concrete, do-this-next-time change — ranked by
   estimated payoff. Prefer changes the orchestrator controls (how it dispatches), not vague "be
   better" notes.
6. **Report.** **Always persist** the full retro (the template below) to
   `docs/retros/<YYYY-MM-DD>-<slug>.md` — create the folder if it does not exist; get today's date
   with `date +%F`; derive the `<slug>` from what the run was doing (kebab-case), matching the
   `docs/plans/` naming convention. Then **add a one-line link to it from `docs/retros/README.md`**
   (create that index from the sibling `docs/plans/README.md` shape if it is missing). Finally, print
   a **short summary in-conversation** — the run-shape headline, the cost & parallelism line, and the
   top recommendation — followed by the retro's file path. Do **not** commit (leave the file in the
   working tree). If the user explicitly names a different path, honour it instead of `docs/retros/`.

## The per-agent row

`# · role/agent-type · dispatch (sync｜parallel-batch｜background) · model (or "inherited") ·
subagent_tokens · tool_uses · duration_ms · outcome (clean｜blocked｜re-dispatched｜failed) ·
one line: what it did / where it struggled`

## Derived metrics worth computing

- **Agents launched** and **unique roles** — breadth of the fan-out.
- **Re-dispatch count** and **rework ratio** = re-dispatched-or-superseded outputs ÷ produced
  outputs. The clearest efficiency signal; a spec written 3× is rework 2/3.
- **Σ subagent_tokens**, **Σ tool_uses**, **Σ agent-seconds** (sum of durations).
- **Parallelism factor** = Σ agent-seconds ÷ wall-clock. ~1 means everything ran serially; >1 means
  real concurrency. If wall-clock is only `~est`, say so.
- **Re-grounding tax** — tokens burned by agents re-reading context a prior agent already had (fresh
  re-dispatches are the usual culprit: each new agent re-reads the codebase from zero).
- **Block rate** = agents that returned blocked/clarification ÷ total.

## Output template

```markdown
# Workflow retro — <what the run was trying to do>

_Date: <YYYY-MM-DD> · Run: <one-line description of what the run was>_

### Run shape
| # | Agent | Dispatch | Tokens | Tools | Duration | Outcome | Note |
|---|-------|----------|-------:|------:|---------:|---------|------|
| 1 | …     | sync     |   110k |    29 |    5m00s | clean   | …    |
_(optional Mermaid gantt/sequence of launch order — via the mermaid-diagram skill)_

### Cost & parallelism
- Σ subagent tokens: <sum, observed> · Σ tool_uses: <n> · Σ agent-seconds: <n>
- Orchestrator (main-loop) tokens: **unknown** (not self-observable)
- Parallelism factor: <n> (~est wall-clock) · Re-dispatches: <n> · Rework ratio: <n>

### What went well
- <agents/steps that returned clean, first try, well-scoped>

### What was hard
- <blocks, dead-ends, "could not find", retries — cite the agent>

### Duplication & waste
- <same files re-read; grounding redone by re-dispatches; re-asked questions>

### What was missed
- <leftover markers, unverified claims, uncovered surface, ownerless decisions>

### Recommendations (ranked by payoff)
1. <concrete dispatch/process change, with the est. saving>
2. …
```

## Boundaries

- **Read-only + one report.** No edits to product source, specs, plans, or existing docs — the one
  write is the retro file under `docs/retros/` (and its `README.md` link line). No commits; no
  `git clean`.
- **Never fabricate unobservable numbers** (see the source table). `unknown`/`~est` beats a
  confident guess.
- **Not a code review and not `engineering-insights`** — it judges the orchestration, not the diff.

## Extending this skill

The metrics above are the floor. A richer catalog of evaluation dimensions to grow into — output
quality vs cost, agent-selection fit, prompt-clarity signals, dispatch-topology alternatives, and a
lightweight scorecard — lives in [`references/metrics.md`](references/metrics.md). Read it when you
want the retro to *grade* the run, not just describe it.
