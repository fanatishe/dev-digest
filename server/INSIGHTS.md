# INSIGHTS — server (`@devdigest/api`)

Append-only engineering insights for this module. Read before you write; add only
significant, non-obvious learnings. See `../.claude/skills/engineering-insights/SKILL.md`
for the rubric.

## What Works
<!-- Approaches, patterns, and solutions that proved effective. problem → what to do. -->

## What Doesn't Work

- **A "skip if the result row is missing" guard is check-then-act, and on a POLLED read it
  is a recurring BILL.** The Intent auto-fill enqueues a billable job from
  `GET /repos/:id/pulls` for PRs with no `pr_intent` row. `upsertIntent`'s `ON CONFLICT`
  makes the *write* idempotent, which reads as safety and is not: no result row exists
  until the job LANDS, so every refetch in the gap re-enqueues the same job — and TanStack
  Query's `refetchOnWindowFocus` fires it on every tab-back. With JobRunner concurrency 3,
  two jobs for one `prId` can also both pass the guard and both call the model. NEVER dedupe
  a billable job against the RESULT table alone — dedupe against the **queue** (`jobs` rows
  in `queued`/`running`). The write being idempotent says nothing about the spend being
  idempotent. (2026-07-13, Smart Diff)

- **A dependency-cruiser baseline is an ALIBI, not evidence.** depcruise reasons at
  *module-edge* granularity. `pulls/routes.ts` was already a documented `routes-no-db`
  violator, so when Smart Diff added a brand-new Drizzle query against a brand-new table
  (`pr_intent` — owned by `modules/reviews`!) it created **no new edge**, the error count
  stayed pinned at the baseline 8, and the tool reported green. The violation was real and
  the check was structurally incapable of seeing it. **Any file on the adopt-and-fix
  backlog needs a human read of its diff, not a green-vs-baseline count.** (2026-07-13)

## Codebase Patterns
<!-- Project conventions, architecture and naming decisions specific to this module. -->

- **`reviewer-core` already returns more than `run-executor` persists.** The review
  `outcome` carries `costUsd` (real OpenRouter `usage.cost`, with an estimate
  fallback) but `run-executor.ts` long destructured only `{ tokensIn, tokensOut,
  grounding }` and dropped it. Before adding new plumbing for a run metric, check
  whether `outcome` already computes it — the gap is usually persistence, not compute.
- **Adding a required field to a shared Zod contract breaks fixtures.** Making
  `RunStats.cost_usd` non-null failed `test/contracts.test.ts` (and client fixtures).
  After a contract change, grep tests for object literals that build it. (2026-07-09)
- **Per-PR list aggregates all live in one block in `pulls/routes.ts`.** The
  `GET /repos/:id/pulls` handler's `if (prIds.length > 0)` block already runs grouped
  `IN`-queries (latest-review score, summed run cost) and builds `Map<prId, …>`. Add
  new list rollups there — e.g. findings-by-severity joins `findings`→`reviews` on
  `pr_id` `WHERE dismissed_at IS NULL` and groups in JS — instead of a new endpoint.
  Watch the scope mismatch: score/cost use the *latest* review, while the findings
  tally intentionally spans *all* of the PR's reviews. New fields are additive +
  `nullish`, so no DB migration and no response-schema break. (2026-07-09)

- **Adding a built-in reviewer agent = 3 lockstep edits, all keyed by name so re-seeding
  is safe.** (1) a prompt constant in `db/seed-prompts.ts`; (2) a byte-mirrored
  `docs/agent-prompts/<slug>.md` (the seed-prompts header mandates the mirror, and the
  `.md` body === the constant body verbatim); (3) a block in `db/seed.ts`. In the seed,
  insert skills via `skillsRepo.insert({ workspaceId, ...s, enabled: true })` — it
  **auto-snapshots v1** into `skill_versions`, so do NOT hand-insert versions (a raw-SQL
  seed from another repo will; this one must not). Link with
  `agentsRepo.linkSkill(agentId, skillId, order)` (idempotent upsert). Agents/skills are
  insert-if-missing by `(workspaceId, name)`, so `pnpm db:seed` is additive + safe to
  re-run. Run/verify with `tsx src/db/seed.ts` after `set -a; . ./.env`. (2026-07-11)

- **A "we excluded the diff bodies" saving is a RENDERING claim, not a parsing one.**
  `parseUnifiedDiff` already drops line text — `DiffHunk` carries positions
  (`oldStart`/`newStart`/`newLineNumbers`) and no `+/-` text; the bodies survive ONLY in
  `UnifiedDiff.raw`. So any such measurement must count **two renderings of the same
  parsed diff** (`tokenizer.count(diff.raw)` vs `tokenizer.count(renderHeadersOnly(diff))`),
  with the same tokenizer, or it is measuring nothing. Corollary for testing: pin the
  guarantee **structurally** — assert every output line is a file header or an `@@` header,
  not merely that one known body string is absent. A substring assertion only proves that
  *one* body line is gone. (2026-07-12, Intent Layer)

- **A pure helper is the right place for an SSRF / path-traversal gate.**
  `repoIntel.getFileContent` → `readClone` does a bare `join(clonePath, file)` with no
  traversal check, so anything feeding it a path derived from user content (e.g. a doc
  link in a PR body) must validate FIRST. Keeping `isSafeRepoPath` / `parseDocRefs` pure
  makes that gate unit-testable with no clone and no DB — and it forces the honest
  design: external URLs are RECORDED and shown as "unresolved reference", never fetched.
  (A server-side fetch of an attacker-controlled URL from a PR body is an SSRF vector —
  `http://169.254.169.254/...` is the canonical payload.) (2026-07-12)

- **`server/src/modules` has ZERO module→module imports** (only `settings/feature-models`
  is shared). Conventions stayed self-contained by consuming a *container facade*
  (`repoIntel`). Before proposing a new module, check whether the facade it would need
  actually EXISTS — if it doesn't, you are inventing a boundary, not following one. The
  Intent Layer folded into `modules/reviews` for exactly this reason: it needs
  `diff-loader` + the `pr_intent` accessors, and there is no diff facade. (2026-07-12)
  - **CORRECTION (2026-07-13): the "ZERO module→module imports" claim is FALSE, and was
    already false when it was written.** `repos/service.ts:11-14` imports `INDEX_JOB_KIND`
    from `../repo-intel/constants.js`. Left above rather than deleted, per this file's own
    `AbortSignal` precedent: a false entry that survives is more dangerous than no entry,
    because it is read as high-confidence guidance. **The accurate rule, in three tiers:**
    (1) a **constants-only** cross-module import is SANCTIONED — a job kind is shared
    vocabulary that neither the enqueuer nor the registrant can own alone, and a `const`
    has no behaviour, no transitive deps, and cannot create a cycle; (2) importing another
    module's **service/repository** is NOT — it drags in that module's container,
    repository and adapters (use the container facade instead); (3) querying another
    module's **Drizzle table** is NEVER — that is table ownership, and it is the one
    depcruise cannot catch (see "a baseline is an alibi", above). Smart Diff follows tier
    1 (`pulls/routes.ts` imports `INTENT_JOB_KIND` from `../reviews/constants.js`) and
    reads findings through `container.reviewRepo`. The paragraph above is still right about
    *facades*; it is only wrong about the word ZERO.

- **A background job that spends money needs its receipt threaded at the SAME commit as its
  trigger.** `classify()` had carried `tokensIn`/`tokensOut`/`costUsd` on `StructuredResult`
  since day one and dropped them at `return res.data` — harmless while a human clicked the
  button, silent automatic spend the moment a job enqueues it. Persist the
  **provider-reported** `costUsd` (null when unreported); NEVER backfill it from
  `adapters/llm/pricing.ts`, whose table has drifted and lied before (see the pricing entry
  above). `cost not reported` is honest; `$0.00000` is a lie. (2026-07-13)

- **A job handler whose payload carries only an id needs a workspace-free row lookup —
  which is safe only if the ROW is the source of the workspace.** `getPullById` derives
  `workspaceId` from the PR row, then re-reads through the scoped `getPull`, so a job can
  never widen its own scope from its payload. But do NOT put such a method on the shared
  `container.reviewRepo` facade: Smart Diff made `pulls/routes.ts` the first ROUTE file to
  hold `reviewRepo`, which would have put a workspace-free read and a request-supplied
  `req.params.id` three lines apart, separated by a comment saying "don't". A comment is not
  a constraint — keep it as a module-private function in `repository/pull.repo.ts` and let
  the in-module service import it directly. (2026-07-13)

- **`adapters/llm/pricing.ts` drifts and then silently LIES.** Reconciled 2026-07-12
  against the live OpenRouter `/api/v1/models`: `deepseek-v4-flash` was listed ~1.8×
  too high, `z-ai/glm-4.7-flash` was listed as FREE (`{in:0,out:0}` — it is not), and
  `glm-4.7-flashx` no longer exists as a model id. Real spend comes from OpenRouter's
  `usage.cost` when present, so the table is only the fallback — but it IS live whenever
  cost is absent. **Any feature whose selling point is cost must fix the row for the
  model it defaults to, or its own cost telemetry is fiction.** (2026-07-12)

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies/tooling. -->

- **`server/package.json` is NOT actually `skip-worktree` in every clone — CHECK, don't
  trust the doc.** Both the root `CLAUDE.md` and `server/CLAUDE.md` assert your edits to it
  "won't show in `git status`". In this clone `git ls-files -v server/package.json` returns
  **`H`, not `S`** — the flag was never set, and the edit DOES show. The flag is per-clone
  local state, so the docs can only ever be describing *someone's* machine. Run
  `git ls-files -v` before concluding either that your edit vanished or that a stray
  `package.json` diff is someone else's. (2026-07-13, adding `verify:l03`)

- **The `jobs` status enum is `queued | running | done | failed` — there is NO `pending`.**
  (`db/schema/ops.ts`.) Anything deduping against in-flight work must test for
  `queued`/`running`; a `status = 'pending'` predicate silently matches nothing and your
  dedupe becomes a no-op. Also note `jobs.enqueue` THROWS `No job handler registered for
  kind '<kind>'` (`platform/jobs.ts:51`) when the module that registers the handler hasn't
  loaded — so any enqueue from a READ path must be wrapped in try/catch or a plain GET
  starts 500ing. (2026-07-13)

- **`review_intent` defaults to the `openrouter` provider**, so a test injecting
  `MockLLMProvider` on the `openai` key silently falls through to real provider
  construction and dies on a missing key. Inject on `llm: { openrouter: … }` for anything
  routed through `resolveFeatureModel(…, 'review_intent')`. Likewise, a `Fixes #NNN` in a
  test PR body makes `container.github()` resolve a REAL token from
  `~/.devdigest/secrets.json`/`process.env` and hit the network — and the service's
  best-effort `try/catch` HIDES it. Integration tests that seed an issue reference must
  inject `github: new MockGitHubClient()`. (2026-07-12)

- **The shared `now()` helper hard-names its column `created_at`.** If you want a
  differently-named timestamp (e.g. `computed_at` on a row that is UPSERTed on every
  recompute — it records the latest scan, not a birth), declare
  `timestamp('computed_at', { withTimezone: true }).defaultNow().notNull()` explicitly.
  Using `now()` and expecting your own name gives you a migration with the wrong column.
  (2026-07-12)

- **You can read a `.zip` with zero dependencies via `node:zlib`.** The skills
  import (`modules/skills/import.ts`) parses the ZIP central directory by hand
  (scan back for the EOCD `0x06054b50`, walk `0x02014b50` records) and inflates
  only the entries it wants with `zlib.inflateRawSync` (method 8) / raw bytes
  (method 0). This let import avoid `@fastify/multipart` + a zip lib entirely: the
  CLIENT reads the file and POSTs JSON (`.md` as text, `.zip` as base64) to
  `POST /skills/import`, which stays under a per-route `bodyLimit`. Bonus: only
  markdown entries are ever decompressed, so "executable parts are never run" is
  structural, not a check. (2026-07-11)

## Recurring Errors & Fixes
<!-- An error seen more than once + its fix. -->

- **A test helper that hard-codes a discriminator column makes the filter on that column
  untestable — while the test's NAME claims to cover it.** `smart-diff.it.test.ts`'s
  `seedReview` hard-coded `kind: 'review'`, so the test titled *"ignores a summary review
  and reads findings from the LATEST review only"* seeded two `'review'` rows and never a
  `'summary'`: you could DELETE the `kind === 'review'` filter from the route and the whole
  suite stayed green. The smell to grep for: **remove the production filter — does any test
  go red?** If not, the guard is vacuous. Parameterize the discriminator in `seed*` helpers.
  (2026-07-13)

- **Assert a skip-if-fresh guard on the MOCK ADAPTER's call count, not on the return
  value.** A guard that returns the cached row while STILL paying for the model call passes
  every return-value assertion. Only
  `llm.calls.filter(c => c.method === 'completeStructured').length === 0` can fail for the
  right reason. (`MockLLMProvider.calls` exists — `adapters/mocks.ts:60,90`.) (2026-07-13)

- **`TS1160: Unterminated template literal` after adding a prompt to `seed-prompts.ts`.**
  Every backtick INSIDE a reviewer prompt is escaped (\\\`code\\\`), but the constant's
  CLOSING delimiter must be a PLAIN backtick + `;` (`…null.` then `` `; ``). Copy-editing
  a new constant off an existing one easily escapes the closing backtick too, so the
  string never terminates and the whole file fails to parse. Fix: unescape the final
  backtick. (2026-07-11)

## Session Notes
<!-- Datestamped one-liners, newest first: ### YYYY-MM-DD -->

### 2026-07-13 (Smart Diff L03 + Intent auto-fill)
Built Smart Diff — `GET /pulls/:id/smart-diff` regroups the SAME diff by role
(core→wiring→boilerplate) with **zero model calls**: it composes `pr_files` + the latest
review's findings, both already paid for. The `SmartDiff` contract was pre-scaffolded
(`brief.ts:95-128`) and shipped unchanged. `classifyFile` is a pure total function with
`core` as the DEFAULT (an unrecognized path is business logic until proven otherwise —
the safe bias, since core is the group we never collapse), and every pattern/threshold
lives in `classifier.constants.ts`; the path split is deliberately regex-free
(`Set.has`/`endsWith` cannot backtrack, and the path is attacker-authored).
**Two things the contract forced:** (1) Smart Diff CANNOT show a per-file "what this does"
from the Intent model — the intent classifier is deliberately never shown hunk bodies
(`renderHeadersOnly`), so `pseudocode_summary` is derived from the patch by a pure symbol
extractor instead; (2) the `SmartDiff` contract is `{groups, split_suggestion}` with
nowhere to put an intent, and `fastify-type-provider-zod` SILENTLY STRIPS an extra key —
so the intent context header is composed client-side from the existing `GET /pulls/:id/intent`
rather than bolted onto the route. Also reversed the Intent Layer's "no auto-compute"
non-goal, narrowly (missing-only, background job, never inside a review run), paid for with
a persisted `cost_usd` receipt (migration 0014). Docker was absent all session: every
`*.it.test.ts` self-skips, so the integration lane is WRITTEN BUT UNEXECUTED.

### 2026-07-12 (Live progress for conventions extract — the RunBus is generic)
**`RunBus` + `GET /runs/:id/events` are NOT review-specific** — the bus is keyed by an
arbitrary string and the SSE route never reads the DB (it just `getContext`s for auth, then
subscribes). So ANY long operation can stream progress with almost no plumbing: the client
mints a UUID, passes it as `scan_id` on the POST, and subscribes to `/runs/{scan_id}/events`.
No `agent_runs` row, no new route, no new endpoint. The bus **buffers and replays**, so a
subscriber that connects a moment after the POST still gets every event from the start — the
handshake isn't racy. Used this to stream the conventions extractor's 4 stages. Two things
that matter for honesty: (1) emit a **`start` event before each stage, not just a `done`
after** — the `analyze` (model) stage dominates the wall clock, so a done-only stream leaves
the UI silent for ~90% of the scan; (2) publish an `error` event in `catch` and ALWAYS
`bus.complete(id)` in `finally`, or a failed scan leaves the client's EventSource hanging
open with a half-finished stage list. Typed the payload as `ConventionScanProgress`
(`{stage, status}`) on the free-form `RunEvent.data` field. `scan_id` is optional — omit it
and extract behaves exactly as before, publishing nothing.

### 2026-07-12 (Conventions evidence pinned to a commit)
Added `conventions.evidence_sha` (migration 0012) so the client can deep-link a rule's
evidence to github.com at the commit it was read from — without a sha you can only link to
a branch, and the cited line numbers drift as soon as the repo moves on. Three things worth
knowing. (1) **Generate migrations, don't hand-write them**: `pnpm db:generate` (drizzle-kit)
also writes `meta/NNNN_snapshot.json` + the `_journal.json` entry; a hand-written `.sql`
leaves the snapshot stale and the NEXT generate then emits a duplicate ALTER. Re-running
generate and getting "No schema changes" is a cheap consistency check. (2) The git port's
`currentHead()` takes a `RepoRef` = `{owner, name}` (`vendor/shared/adapters.ts:98`), but
conventions' `repository.repoRef()` selected only `{name, fullName}` — had to add `owner`.
(3) Resolving HEAD is **best-effort** (try/catch → null), mirroring `safeCurrentHead` in
repo-intel's full pipeline: a clone that isn't a git repo must not fail an otherwise-good
extraction — you lose the deep-link, not the conventions. The column is nullable precisely
so pre-existing rows degrade to "no link" rather than to a link citing the wrong commit.

### 2026-07-11 (Conventions extractor)
Built the `modules/conventions` extractor (L02). Heavily pre-scaffolded: the
`conventions` table (already in `0000_init.sql` — no migration), the `ConventionCandidate`
shared contract, and `conventions` as a `FeatureModelId` with a registry default all
pre-existed. Net-new: the module (routes/service/repository/helpers), a `getFileContent`
facade on `RepoIntel` (reads the clone via the existing module-private `readClone`; safe
to extend the interface — NO partial-interface RepoIntel mock exists in
`adapters/mocks.ts`), a `ConventionSkillDraft` contract, and a `skill-draft` endpoint that
merges ACCEPTED rows into one `<repo>-conventions` skill body WITHOUT persisting (client
confirms via existing `POST /skills` — same import→confirm trust shape). Model choice goes
through `resolveFeatureModel(ws,'conventions')` (registry default is a capable model,
gpt-5.4 — overridable in Settings), NOT `model-router` (that has no 'conventions' TaskKind
and doesn't need one — feature-models is the mechanism for these system features). The
evidence-verification gate (`helpers.verifyEvidence`) is the whole point of stage 3: a
candidate survives only if its cited file was sampled AND the 1-based line exists and is
non-blank — kept a pure helper so it's unit-testable without a DB/LLM. Extraction is a
FULL replace per repo (`replaceForRepo` in a txn); a re-scan drops prior accept state.
typecheck + 120 unit tests green (+10 conventions-extract).

### 2026-07-11 (Skills log line + trace Skill Dynamics)
AC required the EXACT run-log string `Skills: N skill(s) attached to prompt` — changed
`run-executor.ts`'s old `Injecting N skill block(s)` line. Also snapshot each attached
skill `{id,name,version,type,body}` into `RunTrace.config.skills` at injection time so the
client's Skill Dynamics panel shows the exact body even after the skill is later edited.
`config.skills` is nullish/additive and mirrored in BOTH vendored `trace.ts` copies
(server + client) PLUS threaded through `platform/trace-builder.ts` (the shared A5
multi-agent builder) — miss any and a run either loses the snapshot or fails
`RunTraceSchema.parse`. `contracts.test.ts` validates the shape; it stayed green because
the field is optional.

### 2026-07-11 (API Contract Reviewer seed)
Ported the API Contract Reviewer agent + 4 contract skills (breaking-change,
response-schema, semver-discipline, deprecation-policy) from a parallel project's seed,
adapted to local conventions (SkillsRepository/AgentsRepository, DEFAULT_PROVIDER/MODEL,
prompt constant + mirrored docs/agent-prompts/*.md — NOT the parallel file's raw inserts /
openai-gpt4.1 / inline prompts). Also filled the pre-existing missing
`docs/agent-prompts/test-quality-reviewer.md`. Verified against the live DB: seed run
twice → exactly one agent, 4 skills linked in order 0–3, no dupes. typecheck + 110 unit
tests green.

### 2026-07-11 (skills v2)
Added the skill Versions/Stats surface. `skill_versions.message` is the first real
"extend-don't-migrate" column added this course — `pnpm db:generate` emitted a clean
one-line `ALTER TABLE … ADD COLUMN` (0011). `restore()` deliberately calls `update()`
so it flows through the normal body-change → version-bump → snapshot path instead of
duplicating it (restoring the *current* body is a no-op, correctly). `used_by` is a
nullish/additive field on the `Skill` contract populated ONLY by `list` (a grouped
`agent_skills` count merged in the service) — single-skill GETs leave it absent; don't
rely on it off the list. Stats that need per-skill finding attribution (pull%/accept%/
by-category) have no data source yet and were intentionally left to the client as
labeled placeholders.

### 2026-07-11
Built the skills feature. Most of it was pre-scaffolded and only needed wiring:
the `skills`/`skill_versions`/`agent_skills` tables, the `Skill`/`AgentSkillLink`
shared contracts, the agent-side link endpoints (`GET/POST /agents/:id/skills` +
`AgentsRepository.linkedSkills`/`setSkills`), and the engine prompt slot
(`assemblePrompt` `## Skills / rules` + `PromptAssembly.skills`) all already
existed. Net new: the `modules/skills` CRUD module (+ extract-only import), the
run-executor load-enabled-linked-skills → `reviewPullRequest({ skills })` wiring,
and `RunStats.skills_tokens` (nullish/additive, mirrored in BOTH vendored
`trace.ts` copies — they'd already drifted in comments only). No DB migration:
tables pre-exist; only `db/rows.ts` types changed. Prompt injection of a skill is
gated by `skill.enabled` AND agent-link membership, so a disabled skill yields no
prompt block and no trace line.

### 2026-07-09
Extended `PrMeta` (both vendored copies, kept byte-identical) with `findings`
severity counts + a capped `findings_preview`; rolled them up in the existing
`pulls/routes.ts` list block for the new PR-list findings column + hover popup.

## Open Questions
<!-- Unresolved things worth investigating. -->
