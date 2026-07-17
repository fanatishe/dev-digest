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

- **THE CLONE IS SHALLOW (`CLONE_DEPTH = 1`) — ANY feature that reads git history gets
  NOTHING, and it looks like data, not like a bug.** `repos/constants.ts:9` clones with
  `--depth 1`, so the clone holds exactly ONE commit and `git log -- <file>` returns no
  history for *any* file, in *any* repo. This has now bitten twice: it is why
  `file_rank.hotness` is hard-coded to 0 (`pipeline/rank.ts:5` says so outright), and it
  is why `GET /pulls/:id/history` shipped returning an empty list for every PR — a silent
  wrong answer, because "no prior PR touched these files" is a perfectly plausible result.
  **Fix, if you need history: `container.git.deepen(ref, HISTORY_DEPTH)`** — it is now
  called by both `pipeline/full.ts` and `pipeline/incremental.ts`, so it runs in the async
  index job (the import stays fast) and a "Re-analyze" repairs an already-imported repo.
  `git fetch --deepen` is idempotent and a silent no-op on a complete repo. **Before
  building on `git.log`/`git.blame`, ask what the clone actually contains.** (2026-07-14)

- **`git log -- <path>` OMITS MERGE COMMITS, and simple-git will silently drop the flag
  that fixes it.** Two compounding traps, both silent:
  (1) A path-filtered `git log` applies git's *history simplification* and hides the merge
  commit, showing the merged branch's own commits instead — so on a repo that MERGES its
  PRs (`Merge pull request #5 from …`, which is what DevDigest itself does) there is no
  `#N` anywhere in the log to recover. `--full-history` is required.
  (2) **`simpleGit().log({ file, '--full-history': null })` DOES NOT APPLY THE FLAG.** It
  returns the simplified log, with no error, exactly as if you had not passed it — the
  object DSL only understands its own keys and builds the `-- <file>` separator itself.
  **Use the ARRAY form:** `log(['--full-history', '--max-count=50', '--', path])`. Verified
  live: object form → 3 commits (no merge), array form → 4 (merge included).
  Also: a merge commit's SUBJECT is `Merge pull request #N from owner/branch` and the PR's
  real TITLE is in the **body** — hence `GitCommit.body`. (2026-07-14)

- **A PR number recovered from `git log` is NOT this repo's namespace — on a FORK it is
  usually upstream's.** A fork inherits upstream's entire history (its `Merge pull
  request #N` / `(#N)` commits included), and fork PR numbering restarts at #1 — so
  log-`#5` and this-repo-`#5` are typically two unrelated PRs. Three things break if the
  number is trusted bare, and all three shipped that way in PR history before a user
  noticed: a `/pull/N` link opens the fork's own unrelated PR; title enrichment stamps
  the fork's title onto upstream's PR; self-exclusion-by-number hides a real upstream
  entry. **Rule: corroborate before any namespace-sensitive use** — a merge commit names
  its head ref (`from owner/branch` → match `pull_requests.branch`), a squash subject IS
  the title at merge time (→ exact-match `pull_requests.title`); when corroboration
  fails, fall back to the merge COMMIT sha, the only identifier both repos agree on
  (`PrHistoryItem.merge_sha` / `number_confirmed`, `pulls/history.ts corroborates()`).
  There is no way to distinguish the cases from the clone alone, and the `repos` table
  stores no fork/parent info. (2026-07-14)

- **A cap applied to a FLATTENED list silently starves whole groups.**
  `repo-intel/service.ts` capped blast-radius callers with
  `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` over the concatenated list of every changed
  symbol's callers. `MAX_CALLERS_PER_SYMBOL` is the name — the code is a GLOBAL cap. With
  5 changed symbols × 10 callers and a limit of 20, the top-ranked two symbols consume the
  budget and the other three render with **zero** callers, i.e. "nothing downstream depends
  on this" — a claim a reviewer acts on, produced by a truncation. Group first, cap each
  group (`capCallersPerSymbol`, `blast-cap.test.ts` pins it). **Whenever a limit is named
  `*_PER_X`, check that the code actually partitions by X before slicing.** (2026-07-14)

- **An implemented facade method with ZERO consumers is not a working feature, and its
  "degraded contract" test proves nothing about its output.**
  `repoIntel.getBlastRadius()` was fully written, had a persistent path AND a ripgrep
  fallback, and was covered by `repo-intel-facade-degraded.test.ts` — which only asserts it
  does not *throw*. Nothing had ever read its result, so a global-vs-per-symbol cap bug and
  a completely absent import-graph traversal both sat there undetected. The degraded test is
  a liveness check, not a correctness one. **Before building on an unused facade method,
  read its body — do not treat "it exists and is tested" as evidence it is right.**
  (2026-07-14, Blast Radius L04)

- **`isSafeRepoPath` guards the path STRING, and that is TWO gaps short of "this read stays
  inside the clone".** The guard (`modules/reviews/intent-helpers.ts`) is the ONLY
  confinement before `readClone`/`getFileContent`'s bare `join`, and Project Context leaned
  on it in two new places that exposed both gaps. (1) Its output is rendered by reviewer-core
  as an UNFENCED `### <path>` label, so it must reject CONTROL CHARS (`\n`/`\r`/…), not just
  `..`/`/`/`\`/NUL — a POSIX-legal newline in a filename would otherwise break out of the
  header into top-level prompt text (now rejects C0/DEL). (2) It validates the string but NOT
  on-disk symlinks, so a content reader doing `readFile(join(clone, relpath))` follows a
  committed `docs/x.md → /etc/passwd` symlink straight out of the clone. Any fs reader taking
  a repo-relative path needs a SEPARATE realpath confinement:
  `realpath(target).startsWith(realpath(base) + sep)` (the `+ sep` blocks sibling-prefix
  escapes). The discovery walk already skips symlinks; the direct reader was the asymmetric
  hole. (2026-07-17, Project Context)

- **A pgvector column-dimension mismatch produces a SILENT zero-result query, not an error.**
  When you change embedding models and re-embed content (or miss a re-embedding), the stored
  vectors have dimension N but the query vector has dimension M. A `<->` similarity search
  with mismatched dimensions returns **zero rows** — no exception, no hint, just silently
  correct results. The query is technically valid on its own; PostgreSQL just finds no
  matches (a dimension mismatch guarantees orthogonality by construction). This is horrifying
  because: (1) the client shows "no results" instead of "something is broken"; (2) grep for
  "query returned empty" finds config bugs, not dimension bugs. **Always validate: when
  changing embedding models, run a DISTINCT count on the stored vectors' dimensions
  (`SELECT DISTINCT pgvector.dimensionality(column) FROM table`). After re-embedding, run
  the same query and assert the result is a single row — if you see two distinct dimensions,
  one embedding run was incomplete.** This is not a psycopg3 issue or a drizzle issue; it is
  pgvector's design. (2026-07-17)

## Codebase Patterns
<!-- Project conventions, architecture and naming decisions specific to this module. -->

- **`file_edges` is stored importer → imported, and BLAST RADIUS MUST WALK IT BACKWARDS.**
  A row is `from_file` imports `to_file`. "What does this file depend on?" follows the edge
  forwards (that is what `getCriticalPaths` does). **"If I change this file, who breaks?" is
  the opposite question** — it is the file's *dependents*, so you expand
  `to_file → from_file`. Walking it the natural direction returns the changed file's own
  dependencies, which are never affected by the change: a plausible-looking, entirely wrong
  answer. The index already anticipates this — `file_edges_repo_to_idx` is keyed
  `(repo_id, to_file)` precisely because reads go that way. `repo-intel/blast-graph.ts`
  (`reachableDependents`) is the one place that does it; its test asserts the direction
  explicitly, because "it returned some files" is not evidence it went the right way.
  (2026-07-14)

- **A PR-scoped read-only route belongs in `modules/pulls/routes.ts` + a PURE builder — not
  in a new module, and not in the module that owns the data.** Blast Radius reads
  `repo-intel`'s index, but its route is `GET /pulls/:id/blast-radius` in `pulls/`, because
  it is keyed by a PR and needs `pr_files`. This is exactly the Smart Diff shape
  (`getContext` → workspace-scoped `reviewRepo.getPull` → 404 → facade reads → pure builder
  → contract), and it is now the third feature to use it. The module that owns the *engine*
  does not have to own the *route*; the facade (`container.repoIntel`) is what makes that
  legal. (2026-07-14)

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

- **A walk that matches a configured root by directory BASENAME at any depth needs an
  `EXCLUDED_DIRS` gate, or it surfaces dependency docs as project content.** Project Context
  lists `.md` under a dir NAMED `specs`/`docs`/`insights` anywhere in the tree; without
  excluding `node_modules`/`vendor`/`dist`/`.git`/…, a committed `node_modules/x/docs/readme.md`
  shows up as an attachable project doc labelled `docs`, and every discovery request walks
  `.git/`. Keep the excluded set MODULE-LOCAL (don't cross-import repo-intel's `walkClone`
  constants — that is a tier-2 service import). The lazy content endpoint
  (`GET /repos/:repoId/context-docs/content?path=`) resolves the clone via the module's OWN
  workspace-scoped `getClonePath(workspaceId, repoId)`, NOT the unscoped
  `repoIntel.getFileContent(repoId,…)` — a request-supplied `repoId` through the unscoped
  facade is a cross-tenant read. Guard order in the service: `getClonePath` → `isSafeRepoPath`
  → `.md`-only → read; every miss → `NotFoundError` (404, never 500). Docker-free proof of the
  "reads nothing" property: a service-level unit test asserting `readDocBody` is NEVER called
  on a traversal/non-`.md` path. (2026-07-17, Project Context)

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

- **You can prove a route is REGISTERED without Docker: inject a non-uuid id and expect
  422, not 404.** `buildApp()` needs no live Postgres (postgres-js connects lazily) and
  the Zod `params` schema rejects a bad id **before** the handler runs — so no DB is
  touched. A 422 proves the route exists and its contract is attached; a 404 means it was
  never registered. This runs in the UNIT lane (`test/routes-smoke.test.ts`), which matters
  because Docker has now been absent for three consecutive sessions and every `*.it.test.ts`
  self-skips. **When the integration lane can't run, this is the cheapest real evidence the
  wiring landed** — not a substitute for it, but far better than a green typecheck.
  (2026-07-14)

- **`saveRunTrace` lands a beat AFTER `completeAgentRun` flips the run status terminal.** A
  driver/test that waits on `agent_runs.status ∈ {done,…}` then fetches `GET /runs/:id/trace`
  ONCE can hit the sub-ms window where the row is `done` but the trace document isn't written
  yet → a 404 / empty trace (`specs_read === undefined`). When driving the run flow fast (e.g.
  against live PG because Docker is absent), poll for the trace DOCUMENT, not just terminal
  status. (2026-07-17, Project Context)

- **`GitClient.log()` is UNBOUNDED.** `adapters/git/simple-git.ts` calls
  `git.log({ file })` with no `maxCount`, so it walks a file's entire history and
  materialises every commit. Fine for one file; a request that loops over a PR's changed
  files fans out into N unbounded git processes on the render path. `GET /pulls/:id/history`
  caps both axes (`HISTORY_MAX_FILES`, `HISTORY_MAX_COMMITS_PER_FILE` in
  `pulls/blast.constants.ts`). (2026-07-14)

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

### 2026-07-17 (Risk Brief SPEC-02 — built LLM brief, then REVERTED to findings-derived)
An LLM `modules/brief` (`POST /pulls/:id/brief` → one `completeStructured` → cached `pr_brief`) was
built, then **removed the same session** when the design review showed Risk Areas / Review Focus
should be a **deterministic, client-side projection of the existing review findings** — no model
call, no new server surface (the feature is "almost free" precisely because findings are already
computed). Net server change after the revert: none. Durable lesson from the episode:
- **The `pr-self-review` shared-table guard is `merge-base(main)..working-tree`-scoped, so a purely
  additive `ADD COLUMN` hunk false-positives as "altering a shared table"** when the schema file
  (`db/schema/reviews.ts`) already carries earlier committed edits on the branch — the guard's
  per-file `removed` flag reflects the whole branch diff, not your hunk. Verify additivity with
  `git diff -U0 -- <file>` (zero `-` lines) + an `ADD COLUMN`-only migration; `runs.ts` shows the
  same accepted pattern. The guard's real intent — never alter existing columns, never edit an
  existing migration — is what matters.

### 2026-07-17 (Project Context SPEC-01)
Wired the dormant `## Project context` slot end-to-end: new `modules/project-context`
(discovery walk + workspace-scoped clone reads + a lazy `…/context-docs/content?path=`
endpoint), additive `context_docs` jsonb on `agents`/`skills` (migration 0015, ADD COLUMN
only), config roots/budget in `platform/config.ts` (env-overridable like `cloneDir`), and
review-time injection in `run-executor` (agent-first dedup, whole-doc budget drop,
`specs_read`/`specs_tokens`/`specs_skipped` trace). The security seam is `isSafeRepoPath` —
hardened this session to reject control chars AND paired with realpath confinement in the
content reader (see What Doesn't Work); the discovery walk gained an `EXCLUDED_DIRS` gate
(see Codebase Patterns). Docker absent again: `.it` lanes self-skip, so the confinement
properties are pinned by service-level unit tests + a live-PG drive.

### 2026-07-15 (Blast card was stale — no freshness check, no poller)
Reported: recently-merged PRs never appeared in the Overview "Prior PRs" / Blast Radius
cards, even with a token. Root cause was NOT a bug in either card — it was that both read
the **local clone / repo-intel index**, which is a SNAPSHOT: it only advances at import or
on a manual `POST /repos/:id/resync`, and there is **no poller and no freshness check**
anywhere (confirmed by grep — no cron, no `last_polled_at` sweep). The PR *list* and PR
*detail* are live from GitHub, so the two data paths silently diverge: list correct, cards
stale. **Whenever a feature reads the clone (git log / repo-intel), ask not only "what does
the clone contain" (the shallow-clone trap, below) but "HOW OLD is it" — the clone is only
as fresh as the last index, and nothing refreshes it on its own.** Fix (Option A): both
card routes now call an in-file `maybeResync()` that enqueues a background `RESYNC_JOB_KIND`
when the index is stale, serves the current (valid) data immediately, and reports a new
`refreshing` contract flag. Staleness signal is **network-free**:
`max(pull_requests.updated_at) > repo_index_state.updatedAt` (`pullRepo.getLatestPrActivity`
+ pure `pulls/freshness.ts::shouldResyncClone`) — `updated_at` is kept live by the list
sync and a merge bumps it, so it fires exactly on "just merged" and self-terminates once the
resync lands. Three deliberate choices: (1) `refreshing` is DISTINCT from `degraded`
(valid-but-stale ≠ incomplete) and, like `degraded` before it, had to go into the Zod
response schema or `fastify-type-provider-zod` strips it; (2) a **degraded / never-built**
index is NOT resynced from the view — that needs a full index and has its own badge + manual
button, and resync-on-view would risk a reindex storm; (3) deduped against in-flight resync
jobs (`jobs.pendingPayloads`) and best-effort `enqueue` (try/catch) — a card READ must never
500 for a background-refresh miss, same posture as the intent auto-fill. Docker still absent
(4th session): `freshness.test.ts` (pure) + `contracts.test.ts` + the 422-not-404 smoke are
the floor; the enqueue wiring is unexecuted by an integration test.

### 2026-07-14 (Blast Radius L04)
Built `GET /pulls/:id/blast-radius` + `GET /pulls/:id/history` — **zero model calls**; both
read data already paid for (the repo-intel index built at clone time, and the clone's git
log). Almost everything was pre-scaffolded and left **one wire short on purpose**: the
engine (`repoIntel.getBlastRadius`), the `BlastRadius`/`PrHistory` contracts, the client's
`blast.json`, and the Overview placeholder all existed; the MCP tool was a stub whose error
message *named the missing route*. **But the pre-built engine had two real bugs, precisely
because nothing consumed it** (see "an implemented facade method with zero consumers…"): a
global-not-per-symbol caller cap, and no import-graph traversal at all (`file_edges` and
`BFS_DEPTH=2` sat unused by blast). Both fixed; `getBlastRadius` had zero callers, so it
was safe to change. **The contract needed one additive change** — `degraded`/`reason` on
`BlastRadius` — for the reason this file already records: `fastify-type-provider-zod`
silently strips any key the response schema doesn't declare, so a degraded flag bolted on
beside it would never reach the client. That flag is load-bearing: an unindexed repo returns
an EMPTY blast radius, which reads exactly like *"nothing is affected"*. PR-history `notes`
are DERIVED from the file overlap (a squash-merge subject carries `(#482)`, so `git log`
yields the PR number for free) rather than LLM-written — a paid, unfalsifiable sentence on a
card whose whole value is that every line is checkable. Docker absent for the **third**
session running: `blast-radius.it.test.ts` is written but UNEXECUTED; the 422-not-404
smoke tests are what actually proved the routes registered.

### 2026-07-14 (Blast Radius L04 — follow-up: "Prior PRs" was empty on every PR)
Reported symptom: **every** PR showed 0 prior PRs. Not a data gap — **three** stacked bugs,
each of which fails SILENTLY and each of which produces a *plausible* answer ("nothing
touched these files"), which is why none of them announced themselves:
1. **The clone is `--depth 1`.** One commit; `git log -- <file>` sees no history, ever.
   Fixed with `git.deepen()` in the index job (both full + incremental, so "Re-analyze"
   repairs existing repos). The repo ALREADY knew this — `rank.ts:5` documents the same
   wall and abandoned `hotness` over it. I read `GitClient.log()` and never asked what the
   clone contained.
2. **`git log -- <path>` hides merge commits** (history simplification). DevDigest's own
   repo merges rather than squashes, so there was no `#N` to find even with a deep clone.
   Needs `--full-history`.
3. **simple-git silently ignores `{'--full-history': null}`** in its options object. Only
   the ARRAY form works. This one is nasty: the code *looks* correct and the flag just
   evaporates.
Verified by building a throwaway repo with both merge styles, shallow-cloning it, and
running the REAL `SimpleGitClient` + `buildPrHistory` over it: **0 prior PRs → 2**, with
the merge commit's real title recovered from the body. Lesson: for anything that reads git,
a unit test with hand-written fixtures proves nothing about what `git` actually returns —
drive the real adapter against a real repo.

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
