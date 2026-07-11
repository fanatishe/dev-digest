# INSIGHTS — server (`@devdigest/api`)

Append-only engineering insights for this module. Read before you write; add only
significant, non-obvious learnings. See `../.claude/skills/engineering-insights/SKILL.md`
for the rubric.

## What Works
<!-- Approaches, patterns, and solutions that proved effective. problem → what to do. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — don't skip it. -->

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

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies/tooling. -->

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

- **`TS1160: Unterminated template literal` after adding a prompt to `seed-prompts.ts`.**
  Every backtick INSIDE a reviewer prompt is escaped (\\\`code\\\`), but the constant's
  CLOSING delimiter must be a PLAIN backtick + `;` (`…null.` then `` `; ``). Copy-editing
  a new constant off an existing one easily escapes the closing backtick too, so the
  string never terminates and the whole file fails to parse. Fix: unescape the final
  backtick. (2026-07-11)

## Session Notes
<!-- Datestamped one-liners, newest first: ### YYYY-MM-DD -->

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
