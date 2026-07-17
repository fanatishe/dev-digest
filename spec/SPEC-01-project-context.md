# Spec: Project Context | Spec ID: SPEC-01 | Version: 2 | Status: draft
Supersedes: SPEC-01 v1 — this file supersedes the first version **in place** (see
"Changelog — v1 → v2" below). No separate `-v2` file: the `spec/` convention is one
`SPEC-NN-<slug>.md` per feature carrying `Supersedes:`/`Status:`, and there is no
superseding-file precedent in the repo.
Surface: cross-module (server · client · reviewer-core)

## Changelog — v1 → v2 (this version)
This version updates the shipped SPEC-01 to reflect decisions from implementation and
stakeholder/design review (grounded in `docs/plans/2026-07-17-project-context.md` and its
`…-addendum.md`, and the `screenshots/Context Folder.png` design). Everything in v1 that
remains true is preserved unchanged (manual attach/detach/reorder on agents+skills, review-time
dedup/order/budget/untrusted injection, trace visibility, zero LLM calls, paths-only
persistence, extend-don't-migrate). The deltas:

1. **AC-1 sharpened (no behaviour change to the model, wording pinned).** Discovery lists every
   `.md` beneath a directory *named* a configured root (`specs`/`docs`/`insights` by default)
   found **at any depth in the clone tree**, with the folder label taken from the matched root
   segment. The nested example is pinned in the observable; markdown outside a configured-root
   directory is excluded. The configured-roots model stays authoritative (NOT "all markdown
   labelled by top-level area").
2. **AC-6 deferral lifted — document body preview is now fully in scope.** The Project Context
   page is a two-pane master–detail view (document list + preview pane) with a
   Preview (rendered) / Edit (raw source, **read-only**) toggle. **New AC-23** pins the
   read-only Edit behaviour (no authoring/write-back, consistent with the no-authoring Non-goal).
3. **New AC-22 — single-document content read** (the mechanism that feeds AC-6): a read-only
   lookup that returns ONE document's body for the ACTIVE repo, confined by the (control-char
   hardened) safe-path guard **before** any file read, `.md`-only, never a 500, nothing persisted.
4. **New AC-24 + UX corrections from the screenshot** — the page is reachable from the
   **WORKSPACE** nav group; list rows show file icon, filename, folder-path, and root badge;
   selecting a row shows its preview in the right pane.
5. Contracts touched / Inputs / Non-functional / Edge cases updated for the new content-read
   contract (`ContextDocContent`) and its lazy endpoint. Open questions records the one remaining
   plan-level judgment call (nested configured-root-within-a-root labelling).

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
  - Let a user **read** a document's body on the Project Context page in a two-pane master–detail
    view (rendered markdown Preview + read-only raw-source Edit), before deciding to attach it.
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
  - **No authoring** — the reader is read-only; the Edit toggle shows raw source with no
    write-back. Creating/editing/deleting repo markdown from the UI is out of scope.
  - **No new file types or roots beyond config** — only `.md`, only under the configured roots.
  - **No migration of existing shared tables** — attachments are new additive columns only
    (root `CLAUDE.md` extend-don't-migrate rule).
  - Does **not** re-implement or weaken `wrapUntrusted()` / `INJECTION_GUARD` — it relies on them.

## User stories
- **US-1** — As a reviewer author, I want to see every specification/doc/insight markdown in the
  project on a Project Context page (with its path, folder, and token size) reachable from the
  WORKSPACE nav, so that I can find what to attach.
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
- **US-6** — As a reviewer author, I want to open a document and read its **rendered body** (and
  inspect its **raw source**, read-only) in a two-pane view on the Project Context page, so that I
  can verify a doc's content before attaching it.

## Acceptance criteria (EARS)

### Discovery / reader (server + client)
- **AC-1** (US-1) — WHEN the Project Context page (or a Context tab) requests the document list,
  the system shall glob the **currently-selected (active) repo's clone** — the repo shown in the
  header repo switcher, not an aggregate across all workspace repos — and return every `.md` file
  that lives beneath a directory **named** a configured root (`specs`/`docs`/`insights` by
  default) found **at any depth in the clone tree**, each with its repo-relative path, a folder
  label taken from the **matched root segment**, and a token count. Markdown that is not beneath
  any configured-root directory is excluded. The roots are an `AppConfig` field (default
  `['specs','docs','insights']`) overridable via an env var, following the existing
  `cloneDir` / `DEVDIGEST_CLONE_DIR` precedent in `platform/config.ts` — never a call-site literal.
  _(observable: for the active repo's clone containing `a/specs/x.md`, `b/c/docs/y.md`,
  `insights/z.md`, and `notes/other.md`, the list is exactly `a/specs/x.md` (label `specs`),
  `b/c/docs/y.md` (label `docs`), and `insights/z.md` (label `insights`), each with a non-null
  integer `tokens`; `notes/other.md` is excluded; the same clone under a second inactive repo does
  not contribute rows.)_
- **AC-2** (US-1) — IF the repo has no clone (or the clone is unreadable), THEN the system shall
  return an empty document list and the page shall render an explicit empty state, not an error.
  _(observable: request against an uncloned repo returns `{ docs: [] }` with 200; the page shows
  the empty-state copy, no error banner.)_
- **AC-3** (US-1) — WHEN document token counts are computed, the system shall use the same
  tokenizer facade used for other prompt slots (`container.tokenizer.count`). _(observable: a
  doc's reported `tokens` equals `tokenizer.count(fileBody)` for that file.)_
- **AC-4** (US-1) — The system shall display, per document, how many agents (and/or skills)
  currently attach it ("Used by N agents"). _(observable: attaching `specs/public-api.md` to two
  agents makes its `used_by_agents` count 2 in the list and preview pane.)_
- **AC-5** (US-2) — WHEN the user types in the "Filter documents…" box, the system shall narrow
  the visible rows by path/name substring without a server round-trip changing attachment state.
  _(observable: typing `rate` leaves only rows whose path contains `rate`; checkbox states are
  unchanged.)_
- **AC-6** (US-6) — WHEN the user selects a document row on the two-pane master–detail Project
  Context page, the system shall render, in the right-hand **preview pane**, the selected
  document's repo-relative path, its **root badge**, its **token count**, "Used by N agents", a
  **Preview / Edit toggle**, and — under **Preview** — the document's **rendered markdown body**.
  _(observable: selecting the `specs/public-api.md` row shows `178 tokens`, the `specs` badge,
  "Used by N agents", a Preview/Edit toggle, and the rendered document heading in the right pane.)_
- **AC-22** (US-6) — WHEN a single document's body is requested for the **active repo**, the
  system shall validate the requested repo-relative path with the safe-path guard (which rejects
  absolute, `..`-traversing, backslash, NUL, and **control-character** paths) **BEFORE any file
  read**, and shall serve the body only for a `.md` file that exists under the active repo's clone
  root; IF the path is unsafe, non-`.md`, or absent THEN the system shall return **not-found**
  (HTTP 404) without reading any file outside the clone root and without a 500, and shall persist
  no document text. _(observable: a content request for a safe, existing `specs/public-api.md`
  returns `{ path, body }` (200); requests for `../../etc/passwd`, a path containing a control
  character, a `foo.txt`, and an absent `specs/missing.md` each return 404 — never a 200 body,
  never a 500; no file outside the clone root is opened; no row is written to any table.)_
- **AC-23** (US-6) — WHEN the user switches the preview pane to **Edit**, the system shall show
  the selected document's **raw markdown source, read-only**, with no authoring or write-back
  affordance, consistent with the no-authoring Non-goal. _(observable: the Edit view shows the
  verbatim raw markdown source; there is no Save control and no write request is issued while
  viewing or interacting with it.)_
- **AC-24** (US-1) — The Project Context page shall be reachable from the **WORKSPACE**
  navigation group (positioned with the workspace surfaces, alongside Pull Requests), not from the
  SKILLS LAB group. _(observable: the app-shell nav renders the "Project Context" item within the
  WORKSPACE group; activating it routes to the Project Context page.)_

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
- **AC-14** (US-4) — IF an attached path is unsafe (absolute, `..`-traversing, backslash/NUL,
  control-character, or otherwise escaping the clone root), THEN the system shall refuse to read it
  (treat it as not-found) and never read a file outside the clone root. _(observable: an attached
  path `../../etc/passwd` reads nothing, injects nothing, and is recorded as skipped; no file
  outside `clonePath` is opened. See `isSafeRepoPath`, `reviews/intent-helpers.ts:108` — now
  hardened to also reject control characters (`\x00-\x1f`, `\x7f`); `readClone` does a plain
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
  _(observable: the trace drawer shows "Specs read: …" and an expandable "Project context — attached
  specs (untrusted)" block whose content matches `prompt_assembly.specs`.)_

## Edge cases
- No clone present → AC-2 (empty state) · Zero `.md` under roots → AC-1/AC-2 (empty list) ·
  Attached path missing at review time → AC-13 (skip + not-found) · Unsafe/traversing path (review
  time) → AC-14 (refuse) · Total exceeds budget → AC-15/AC-11 (drop remainder + warn) · Duplicate
  path via agent+skill → AC-12 (dedup first) · Malicious/instruction-bearing doc body → AC-17 (data
  only) · No docs attached / all not-found → AC-18 (section omitted) ·
  **Single document larger than the whole budget** → AC-15 (dropped whole, never head-truncated;
  reported over-budget in the trace) ·
  **Single-document content read — unsafe path (`../`, absolute, backslash/NUL, control char)** →
  AC-22 (404, nothing read) · **content read — non-`.md` path** → AC-22 (404) ·
  **content read — absent `.md` path** → AC-22 (404) ·
  **Attached path present in metadata but absent from the currently-selected repo's clone in the
  editor** → accepted: the editor shows the stored path as attached (path-only, cross-repo); a
  "missing in this repo" affordance is a nice-to-have, not required here.
- **Nested configured-root-within-a-configured-root** (e.g. a `docs/` directory inside a `specs/`
  directory, or `specs/docs/y.md`) → provisionally AC-1 with the **outermost matched root wins,
  each file listed once** rule (see Open questions — the one remaining plan-level judgment call).

## Non-functional  — each with a number/level, else parked in Open questions
- **Performance**: the document-list endpoint shall complete a clone glob for a typical repo
  (≤ ~2000 candidate files) within a p95 of ≤ 500 ms. For repos above ~2000 candidate files the
  bound is **explicitly deferred — parked, to be revisited if/when a >2000-file repo appears**; no
  numeric guarantee at that scale is made for now. The single-document content read (AC-22) reads
  exactly one file on demand (lazy, on selection) — not a per-row eager fetch.
- **Rate / cost**: zero LLM calls (AC-19); deterministic file reads + tokenizer counts only.
- **Security**:
  - Review-time reads are confined to the reviewed clone root (AC-14); document bodies are always
    untrusted-fenced (AC-16, AC-17); no document text is persisted to the DB (AC-7).
  - The single-document content read (AC-22) is confined to the **active repo's** clone root by the
    safe-path guard — control-char-hardened, applied **before** any read; it serves `.md` only;
    unsafe/non-`.md`/absent → 404 (never 500, never a read outside the clone root); no body is
    persisted. The read is workspace-scoped so it cannot serve another tenant's clone.
  - Untrusted bodies rendered on the client (Preview/Edit) go through the safe markdown path
    (never `dangerouslySetInnerHTML`); path labels render as text, not HTML.
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
- **Document body preview** — [new: a **lazy** `GET /repos/:repoId/context-docs/content?path=…`
  read of ONE `.md` off the **active** repo clone; deterministic file read gated by the
  `isSafeRepoPath` guard; **no persistence**] [reused: `isSafeRepoPath`,
  `reviews/intent-helpers.ts:108`] — **no LLM calls**.
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
instructions. The **preview** content read (AC-22) returns the same untrusted body; the client
renders it through the safe markdown path (Preview) or read-only raw source (Edit), never via
`dangerouslySetInnerHTML`. This spec relies on those guards and must not restate or weaken them.

## Diagrams / workflows

Review-time injection (the primary cross-module seam):

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

Preview content read (the new discovery-side seam — AC-6 / AC-22):

```mermaid
sequenceDiagram
  participant UI as Project Context page (client)
  participant RT as project-context routes (server · HTTP)
  participant SV as project-context service (server · app ring)
  participant FS as active repo clone (fs, infra)
  UI->>RT: GET /repos/:repoId/context-docs/content?path=<rel> (on row select)
  RT->>SV: getContextDocContent(workspaceId, repoId, path)
  SV->>SV: isSafeRepoPath(path) && .md ? else → 404 (NO read)
  SV->>FS: read path off clone root (only when the guard passed)
  FS-->>SV: body | null (absent → 404)
  SV-->>UI: { path, body } (untrusted; rendered via safe markdown / read-only raw)
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
- **project-context document listing** (paths-only read model) — a read model per repo: `docs:
  [{ path, root (specs|docs|insights), tokens, used_by_agents, used_by_skills? }]` plus the config
  `token_budget`. Owner: server (client only renders it). This listing carries **no bodies**.
- **New: single-document content read** (`ContextDocContent`) — a **lazy** read model per repo,
  shape `{ path, body }`, served by `GET /repos/:repoId/context-docs/content?path=<repo-relative>`.
  Deliberately **separate** from the paths-only listing: bodies are fetched on demand for the
  preview pane, never as part of the listing. `body` is untrusted author markdown; the client
  renders it via a safe markdown primitive (Preview) or read-only raw source (Edit). Owner: server
  (client renders). Confined by the safe-path guard (AC-22); no body is persisted. "Used by N
  agents" in the preview header is composed from the listing row (AC-4), **not** from this endpoint.
- **agent/skill attachment** — `context_docs: string[]` (ordered repo-relative paths) as additive
  columns on `agents` and `skills`. Read/written by the editors; read at review time.

## Open questions
- [NEEDS CLARIFICATION: **nested configured-root-within-a-configured-root labelling.** When a
  directory *named* a configured root sits inside another (e.g. a `docs/` directory under a
  `specs/` directory, or `specs/docs/y.md`), which root labels the file, and is it listed once? The
  implementation resolves this as **"the OUTERMOST matched root wins; each file is listed exactly
  once"** (see `docs/plans/2026-07-17-project-context-addendum.md` §10 Q1). The task's decided
  AC-1 example only covers non-nested roots, so this is a genuine plan-level judgment call — confirm
  the outermost-wins-once rule, or specify that the inner root should re-label / produce a duplicate
  row. AC-1's pinned observable is unaffected either way.]
- All other v1 threads are resolved. The five original v1 open threads (single-doc-over-budget
  behaviour, assembled-block layout, which clone the listing globs, configurable-roots mechanism,
  and the budget default) remain folded into AC-1, AC-15, AC-16, the edge-case table, and the
  Non-functional budget entry. The very-large-monorepo (> ~2000 candidate files) performance bound
  is a settled decision to **park it**. The v1→v2 additions (nested-root wording, body preview,
  content read, nav placement) are stakeholder/design decisions encoded as AC-1, AC-6, AC-22, AC-23,
  and AC-24; the content-endpoint `.md`-only defense-in-depth is pinned by AC-22, and the Edit-tab
  read-only behaviour is pinned by AC-23.

---
Next step: `implementation-planner(spec=spec/SPEC-01-project-context.md)` once the single open
thread above is resolved and the human approves. (The already-shipped base plan and its addendum
implement v1 + these v2 deltas; this spec remains the source of truth they trace back to.)
