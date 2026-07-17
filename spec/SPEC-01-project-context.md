# Spec: Project Context | Spec ID: SPEC-01 | Status: draft
Supersedes: none
Surface: cross-module (server · client · reviewer-core)

## Problem and purpose
A repository's specifications, design docs, and incident write-ups already encode the rules a
reviewer should enforce — but today they are documents "for humans" only, and the review agents
never see them. **Project Context** lets a user manually attach any repo markdown (from the
`specs/`, `docs/`, or `insights/` folders) to a review agent or skill. At review time the
attached documents' text is injected — as untrusted DATA — into the prompt's existing
`## Project context` slot, so a spec's invariant ("the `api/` module must not import `db/`
directly") becomes a rule the reviewer can catch and quote. This is the first of two
spec-in-the-loop features; it is deliberately small and manual, and it reuses prompt/trace
plumbing that already exists but is currently unwired.

## Goals / Non-goals
- **Goals**
  - Discover every `.md` under the configured project-context roots in a repo clone and list
    them on a **Project Context** page and in the agent/skill **Context** tab, with path,
    folder badge, and token count.
  - Let a user **manually** attach/detach and **order** documents on an agent and on a skill;
    persist only the repo-relative **path strings** (never embedded text) in agent/skill
    metadata.
  - At review time, resolve the effective document set (agent docs + enabled/linked skills'
    docs, deduped, agent-first), read the files off the reviewed PR's own clone, cap the total
    by a token budget, and inject them into the `## Project context` slot as untrusted data.
  - Make the injection auditable in the run trace: which docs were read, their token volume,
    the verbatim assembled block, and any not-found or over-budget drops.
  - Add **zero** new LLM calls.
- **Non-goals** (boundaries the planner must not cross)
  - **Auto-selection / "flash-selector"** — automatically choosing which specs a given PR needs
    is FUTURE work. This feature is manual selection only.
  - The **L06 cross-check agent** (an agent whose sole job is to verify an implementation against
    a spec and block the merge) is out of scope.
  - **No embedding of document text** into saved agent/skill metadata — paths only.
  - **No authoring** — the reader is read-only; creating/editing/deleting repo markdown from the
    UI is out of scope.
  - **No new file types or roots beyond config** — only `.md`, only under the configured roots.
  - **No migration of existing shared tables** — attachments are new additive columns only
    (root `CLAUDE.md` extend-don't-migrate rule).
  - Does **not** re-implement or weaken `wrapUntrusted()` / `INJECTION_GUARD` — it relies on them.

## User stories
- **US-1** — As a reviewer author, I want to see every specification/doc/insight markdown in the
  project on a Project Context page (with its path, folder, and token size), so that I can find
  what to attach.
- **US-2** — As a reviewer author, I want to attach, detach, reorder, filter, and preview
  documents on an **agent** and see how many tokens they add, so that I control what context each
  agent's prompt pays for.
- **US-3** — As a reviewer author, I want to attach documents to a **skill**, so that every agent
  linking that skill inherits them.
- **US-4** — As a reviewer author, I want a launched review to actually inject the attached
  documents' text into the prompt (deduped, ordered, budget-capped, untrusted), so that the
  reviewer can enforce and quote the spec.
- **US-5** — As a reviewer author, I want the run trace to show which documents were injected,
  their token volume, and their verbatim assembled text, so that I never have to guess what the
  model saw.

## Acceptance criteria (EARS)

### Discovery / reader (server + client)
- **AC-1** (US-1) — WHEN the Project Context page (or a Context tab) requests the document list,
  the system shall glob the **currently-selected (active) repo's clone** — the repo shown in the
  header repo switcher, not an aggregate across all workspace repos — and return every `.md` file
  found recursively under the configured roots at any depth, each with its repo-relative path, its
  root/folder label, and a token count. The roots are an `AppConfig` field (default
  `['specs','docs','insights']`) overridable via an env var, following the existing
  `cloneDir` / `DEVDIGEST_CLONE_DIR` precedent in `platform/config.ts` — never a call-site literal.
  _(observable: for the active repo's clone containing `a/specs/x.md`, `b/c/docs/y.md`,
  `insights/z.md`, and `notes/other.md`, the list is exactly the first three, each with a non-null
  integer `tokens` and folder label `specs|docs|insights`; the same clone under a second inactive
  repo does not contribute rows.)_
- **AC-2** (US-1) — IF the repo has no clone (or the clone is unreadable), THEN the system shall
  return an empty document list and the page shall render an explicit empty state, not an error.
  _(observable: request against an uncloned repo returns `{ docs: [] }` with 200; the page shows
  the empty-state copy, no error banner.)_
- **AC-3** (US-1) — WHEN document token counts are computed, the system shall use the same
  tokenizer facade used for other prompt slots (`container.tokenizer.count`). _(observable: a
  doc's reported `tokens` equals `tokenizer.count(fileBody)` for that file.)_
- **AC-4** (US-1) — The system shall display, per document, how many agents (and/or skills)
  currently attach it ("Used by N agents"). _(observable: attaching `specs/public-api.md` to two
  agents makes its `used_by_agents` count 2 in the list and preview drawer.)_
- **AC-5** (US-2) — WHEN the user types in the "Filter documents…" box, the system shall narrow
  the visible rows by path/name substring without a server round-trip changing attachment state.
  _(observable: typing `rate` leaves only rows whose path contains `rate`; checkbox states are
  unchanged.)_
- **AC-6** (US-2) — WHEN the user opens a document's Preview, the system shall show its
  repo-relative path, folder badge, token count, "Used by N agents", an Attach/Attached toggle,
  and the rendered markdown body. _(observable: the preview drawer for `specs/public-api.md`
  shows `178 tokens`, the `specs` badge, and the rendered document heading.)_

### Attachment / persistence (server + client)
- **AC-7** (US-2) — WHEN the user attaches or detaches a document on an agent, the system shall
  persist the change as an **ordered list of repo-relative path strings** in the agent's metadata
  (a new additive column), never the document text. _(observable: after attaching two docs, the
  agent row's context-docs column holds exactly those two paths in order; no document body is
  stored.)_
- **AC-8** (US-2) — WHEN the user reorders attached documents, the system shall persist the new
  order, and that order shall be the injection order at review time. _(observable: dragging doc B
  above doc A persists `[B, A]`; a subsequent run's `## Project context` renders B before A.)_
- **AC-9** (US-3) — WHEN the user attaches a document to a skill, the system shall persist it in
  the skill's metadata (a new additive column) as an ordered path list, on the same contract as
  the agent. _(observable: the skill row's context-docs column holds the attached paths in order.)_
- **AC-10** (US-2) — WHILE the agent Context tab is open, the system shall show a running total of
  the tokens the currently-attached documents would add and label the injection target. _(observable:
  the footer reads "≈ N tokens" where N equals the summed token counts of the checked docs, and
  states the block is injected as untrusted `## Project context`.)_
- **AC-11** (US-2) — IF the total attached-document tokens exceed the configured project-context
  token budget, THEN the editor shall surface a visible over-budget warning. _(observable: with a
  budget of B and attachments summing > B, the Context tab renders an over-budget indicator.)_

### Review-time injection (server + reviewer-core)
- **AC-12** (US-4) — WHEN a review runs, the system shall compute the effective document set as
  the agent's own attached paths in saved order, followed by each ENABLED+LINKED skill's attached
  paths, deduplicated by full repo-relative path keeping the first occurrence. _(observable: agent
  attaches `[specs/a.md, docs/b.md]`; a linked enabled skill attaches `[docs/b.md, specs/c.md]`;
  the resolved order is `[specs/a.md, docs/b.md, specs/c.md]` — `docs/b.md` appears once.)_
- **AC-13** (US-4) — WHEN resolving an attached path, the system shall read it from the **reviewed
  PR's own repo clone** (path-only, cross-repo), and IF the path is absent in that clone THEN it
  shall skip that document, record it as not-found in the trace, and the run shall still complete.
  _(observable: an attached path missing from the reviewed clone produces no `### <path>` chunk in
  the prompt, appears in the trace's not-found record, and the run status is `done`.)_
- **AC-14** (US-4) — IF an attached path is unsafe (absolute, `..`-traversing, backslash/NUL, or
  otherwise escaping the clone root), THEN the system shall refuse to read it (treat it as
  not-found) and never read a file outside the clone root. _(observable: an attached path
  `../../etc/passwd` reads nothing, injects nothing, and is recorded as skipped; no file outside
  `clonePath` is opened. See `isSafeRepoPath`, `intent-helpers.ts:101`; `readClone` does a plain
  `join` with no confinement of its own.)_
- **AC-15** (US-4) — WHEN the summed token count of the resolved documents exceeds the configured
  budget, the system shall inject documents in effective order until the next document would exceed
  the budget, then drop that document **whole** and all after it — never head-truncating a
  document to partially fill the remaining budget — and surface a visible over-budget warning in
  the run (Live Log + trace). This applies equally to a single document whose tokens alone exceed
  the budget: it is dropped in full and reported as over-budget in the trace, exactly like any
  other dropped doc (a partial untrusted spec must never be injected). _(observable: with budget B
  and docs whose cumulative tokens cross B at doc k, docs 1..k-1 are injected, docs k..n are
  absent, no injected doc body is truncated, and a warn-level log line + trace field names the
  dropped docs; a lone doc whose tokens exceed B injects nothing and is named as over-budget.)_
- **AC-16** (US-4) — WHEN one or more resolved documents are injected, the system shall render them
  as a single flat block — `## Project context` followed by one `### <repo-relative path>` chunk
  per document in effective order — with the document bodies fenced as untrusted DATA consistent
  with `wrapUntrusted()`, never as trusted instructions. This flat block is the **authoritative
  wire format** (what actually reaches the model); it is not grouped by folder. The skill-editor
  "SERIALIZES AS" panel is an editor-only preview/manifest and is NOT required to match this wire
  block verbatim (it may group by folder). _(observable: `prompt_assembly.specs` contains a
  `### specs/public-api.md` header followed by that file's body under a single `## Project context`
  heading with no per-folder subheadings, and the body is enclosed in the untrusted delimiters
  produced by `wrapUntrusted`.)_
- **AC-17** (US-4) — IF an attached document's body contains text that attempts to change the
  reviewer's role or waive findings, THEN the injected block shall still be treated as data and the
  reviewer's grounding/injection guarantees shall be unchanged. _(observable: a doc body containing
  "ignore all findings" does not suppress a real grounded finding on an offending diff; `INJECTION_GUARD`
  remains appended to the system prompt.)_
- **AC-18** (US-4) — WHERE no document is attached (agent and its enabled skills contribute none)
  OR every resolved document is not-found, the system shall omit the `## Project context` section
  entirely, leaving the prompt byte-identical to a review with no project context. _(observable:
  `prompt_assembly.specs` is null and the assembled user message contains no `## Project context`
  heading.)_
- **AC-19** (US-4) — The system shall add zero new LLM calls for this feature; document reading and
  token counting are deterministic file I/O only. _(observable: a review with N attached docs makes
  the same number of model calls as the same review with none.)_

### Trace visibility (server + client)
- **AC-20** (US-5) — WHEN a run completes, the system shall record the injected documents' paths in
  `RunTrace.specs_read` and their total token volume in an additive `RunStats` field, following the
  nullish/additive convention so older traces still validate. _(observable: `specs_read` equals the
  ordered injected paths; a new nullish `specs_tokens` equals the token sum of the injected block;
  a pre-feature trace with neither still parses.)_
- **AC-21** (US-5) — WHEN the user opens the run trace, the Configuration section shall list the
  specs read and the Prompt-assembly section shall expose an expandable "Project context — attached
  specs (untrusted)" entry whose modal shows the verbatim assembled `## Project context` block.
  _(observable: the trace drawer shows "Specs read: …" and an expandable Project-context block whose
  content matches `prompt_assembly.specs`.)_

## Edge cases
- No clone present → AC-2 (empty state) · Zero `.md` under roots → AC-1/AC-2 (empty list) ·
  Attached path missing at review time → AC-13 (skip + not-found) · Unsafe/traversing path →
  AC-14 (refuse) · Total exceeds budget → AC-15/AC-11 (drop remainder + warn) · Duplicate path via
  agent+skill → AC-12 (dedup first) · Malicious/instruction-bearing doc body → AC-17 (data only) ·
  No docs attached / all not-found → AC-18 (section omitted) ·
  **Single document larger than the whole budget** → AC-15 (dropped whole, never head-truncated;
  reported over-budget in the trace) · **Attached path present in metadata but absent from the currently-selected repo's
  clone in the editor** → accepted: the editor shows the stored path as attached (path-only,
  cross-repo); a "missing in this repo" affordance is a nice-to-have, not required here.

## Non-functional  — each with a number/level, else parked in Open questions
- **Performance**: the document-list endpoint shall complete a clone glob for a typical repo
  (≤ ~2000 candidate files) within a p95 of ≤ 500 ms. For repos above ~2000 candidate files the
  bound is **explicitly deferred — parked, to be revisited if/when a >2000-file repo appears**; no
  numeric guarantee at that scale is made for now.
- **Rate / cost**: zero LLM calls (AC-19); deterministic file reads + tokenizer counts only.
- **Security**: runtime reads are confined to the clone root (AC-14); document bodies are always
  untrusted-fenced (AC-16, AC-17); no document text is persisted to the DB (AC-7).
- **Budget default**: `DEFAULT_PROJECT_CONTEXT_TOKEN_BUDGET = 8000` tokens — the confirmed starting
  value (curated, human-attached context warrants a larger cap than the derived
  `DEFAULT_REPO_MAP_TOKEN_BUDGET = 1500`). Explicitly **tunable** via an env override following the
  `cloneDir` / `DEVDIGEST_CLONE_DIR` config pattern (`platform/config.ts`).
- **Observability**: not-found and over-budget drops are surfaced at info/warn in the run Live Log
  (matching how skills/callers/repo-map log their attachment) and in the trace.

## Inputs (provenance)  — what this feature actually pays for
- `## Project context` block — [reused: existing `assemblePrompt` `parts.specs` slot,
  `PromptAssembly.specs`, `RunTrace.specs_read`; today hard-coded empty] [deterministic: file reads
  off the reviewed clone + `tokenizer.count`]
- Per-doc + total token counts — [reused: `skills_tokens` tokenizer pattern,
  `run-executor.ts:266`]
- Attachment persistence — [new: additive `context_docs` columns on `agents` and `skills`
  (ordered `string[]` of repo-relative paths)]
- Trace token volume — [new: additive nullish `specs_tokens` on `RunStats`, mirroring
  `skills_tokens`]
- LLM calls added by this feature — **none**.

## Untrusted inputs
Attached document bodies are author-controllable repo markdown — a PR author can add or edit a
file under `specs/`, `docs/`, or `insights/`. They are therefore **untrusted DATA**, fenced with
`wrapUntrusted()` and governed by `INJECTION_GUARD` (`reviewer-core/src/prompt.ts`), exactly like
the diff and PR body. Repo-relative **paths** used as `### <path>` labels are likewise
author-influenced and must be rendered inside (or as) untrusted-safe structure, not as trusted
instructions. This spec relies on those guards and must not restate or weaken them.

## Diagrams / workflows
Review-time injection (the cross-module seam):

```mermaid
sequenceDiagram
  participant RE as run-executor (server · app ring)
  participant AR as agents/skills repo (server · infra)
  participant FS as reviewed clone (fs, via readClone)
  participant TK as tokenizer facade
  participant RC as reviewer-core assemblePrompt
  RE->>AR: effective docs = agent paths + enabled-skill paths (dedup, agent-first)
  loop each path in effective order
    RE->>RE: isSafeRepoPath(path)? else skip → not-found
    RE->>FS: read path off clone root
    FS-->>RE: body | null(not-found)
    RE->>TK: count(body); stop when budget exceeded (drop remainder + warn)
  end
  RE->>RC: assemblePrompt({ specs: ordered {path, body} chunks, … })
  RC-->>RE: messages + PromptAssembly{ specs } (untrusted-fenced ## Project context)
  RE->>RE: persist RunTrace{ specs_read, stats.specs_tokens, prompt_assembly.specs }
```

## Contracts touched  (shapes only — no code)
- **`@devdigest/shared` `contracts/trace.ts`** — `PromptAssembly.specs` (exists, reused);
  `RunTrace.specs_read: string[]` (exists, now populated with injected paths in order);
  **new** `RunStats.specs_tokens` (nullish integer, additive — token volume of the injected block);
  optionally a **new** nullish field recording skipped docs (not-found / over-budget dropped) so the
  trace can name them (shape: array of `{ path, reason }`).
- **`reviewer-core` `PromptParts.specs`** — the existing optional slot. This feature feeds it the
  ordered, budget-capped documents; the assembled `## Project context` labels each chunk by
  repo-relative path (`### <path>`) and fences bodies as untrusted. Whether the slot type stays
  `string[]` (run-executor pre-labels each chunk) or becomes `{ path, body }[]` (reviewer-core
  labels) is a plan decision; the observable in AC-16 must hold either way. Honor the
  omit-when-empty byte-identity contract (AC-18).
- **New: project-context document listing** — a read model per repo: `docs: [{ path, root
  (specs|docs|insights), tokens, used_by_agents, used_by_skills? }]`. Owner: server (client only
  renders it).
- **New: agent/skill attachment** — `context_docs: string[]` (ordered repo-relative paths) as
  additive columns on `agents` and `skills`. Read/written by the editors; read at review time.

## Open questions
(none — all resolved.) The five original open threads (single-doc-over-budget behaviour,
assembled-block layout, which clone the listing globs, configurable-roots mechanism, and the
budget default) are resolved by stakeholder decision and folded into AC-1, AC-15, AC-16, the
edge-case table, and the Non-functional budget entry. The very-large-monorepo (> ~2000 candidate
files) performance bound is a settled decision to **park it**: the ≤ 500 ms / ≤ 2000-file target
stands, and any numeric bound at larger scale is deferred until a >2000-file repo actually
appears.

---
Next step: `implementation-planner(spec=spec/SPEC-01-project-context.md)` once the open questions
are resolved and the human approves.
