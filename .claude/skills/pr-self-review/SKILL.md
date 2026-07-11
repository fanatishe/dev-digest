---
name: pr-self-review
description: >-
  Local pre-PR gate. Before any PR-opening GitHub call (gh pr create / git push)
  or on manual request, diffs the branch against main, classifies each changed
  file, runs the matching domain skills over only their changed hunks, aggregates
  findings under DevDigest's own Finding/Verdict contract, and BLOCKS (refuses to
  open the PR) when any critical finding is confirmed. Trigger terms: self-review,
  pre-PR check, open a PR, gh pr create, ready to push, review my changes before PR.
metadata:
  tags: review, gate, pre-pr, ci, meta
allowed-tools: Read, Bash, Grep, Glob, Skill
---

# PR Self-Review — local pre-PR gate

Run this **before opening a pull request** (before `gh pr create` / `git push`), or
whenever asked to "self-review my changes". It routes the working diff to the domain
skills this repo already ships, adds deterministic checks CI would fail on, and turns
the result into a **go / no-go gate**: if any **CRITICAL, high-confidence** finding
survives, it emits a **BLOCK** (`request_changes`) verdict and you must **not** open
the PR.

> Mechanical parts (diff, classification, deterministic checks, verdict, exit code)
> live in [`assets/self-review.mjs`](assets/self-review.mjs) — a zero-dep Node script.
> The report shape mirrors the product contract in
> [`assets/report.schema.ts`](assets/report.schema.ts). Worked runs in
> [`examples.md`](examples.md).

## The contract (reuse it — do not invent a new taxonomy)

Findings and the verdict use DevDigest's own schema
(`server/src/vendor/shared/contracts/findings.ts`, exported as `@devdigest/shared`):

- **Severity** — `CRITICAL | WARNING | SUGGESTION`.
- **confidence** — a number `0..1`; **`>= 0.8` is "high confidence"**.
- **Verdict** — `request_changes | approve | comment`. **`request_changes` is BLOCK.**

Map each domain skill's own labels onto this: skill `CRITICAL → CRITICAL`,
`HIGH → WARNING`, `MEDIUM/LOW → SUGGESTION` (drop pure LOW/theoretical). Apply the
**confidence gate from the `security` skill** (HIGH = report, MEDIUM = note, LOW = skip)
before recording anything.

## Procedure

Run these steps in order. Do not skip step 1 or 2a.

### 1 · Compute the diff (files + hunks)

```bash
node .claude/skills/pr-self-review/assets/self-review.mjs classify
```

This diffs **merge-base(main)..working-tree + untracked** (everything that would land
in the PR, including uncommitted edits), prints each changed file with its buckets,
lists the **skills to invoke**, and the **packages to check**. Empty set → report
"no changes" and stop. Add `--json` for a machine-readable plan (`skillsToRun` maps
each skill to its files + changed line ranges).

### 2a · Deterministic pre-flight gate (before any LLM skill)

```bash
node .claude/skills/pr-self-review/assets/self-review.mjs preflight
```

Cheap, non-hallucinating CRITICAL checks that mirror CI. It runs:

- **Onion boundaries** — dependency-cruiser with the repo's shipped config
  (`.claude/skills/onion-architecture/assets/onion.dependency-cruiser.cjs`); a
  violation whose source file is in the diff = **CRITICAL**.
- **CI-equivalent typecheck + tests** — only for touched packages (`client`,
  `server` [+ `reviewer-core`/`shared` alias]); a failure = **CRITICAL**. Guarantees
  green-locally == green-in-CI. (Set `SELF_REVIEW_SKIP_TESTS=1` to skip during a
  quick pass, but never for the final gate.)
- **Secret-scan** — added lines matching key/token/private-key patterns = **CRITICAL**
  (`secret_leak`); upholds "secrets never touch git".
- **Shared-table guard** — altering existing lines in `server/src/db/schema/**` or
  editing an existing `db/migrations/**` file = **CRITICAL** (extend, never migrate).

### 2b · Run the matching domain skills — over changed hunks only

For each skill in `skillsToRun`, invoke it via the **Skill tool**, passing **only its
files and the changed hunks** (not whole files). Ask each to report findings in the
contract shape `{severity, category, title, file, start_line, end_line, rationale,
suggestion, confidence}`. Routing (also encoded in the script):

| Changed file | Skills |
|---|---|
| `client/src/app/**`, `client/src/components/**`, `client/**/*.tsx` | `frontend-ui-architecture`, `react-best-practices`, `next-best-practices` |
| `client/src/lib/**` | `react-best-practices`, `frontend-ui-architecture` |
| `client/**/*.test.tsx` | `react-testing-library` |
| `server/src/modules/*/routes.ts`, `server/src/{app,server}.ts` | `fastify-best-practices`, `onion-architecture` |
| `server/src/modules/*/{service,repository}.ts`, `server/src/platform/**` | `onion-architecture` |
| `server/src/adapters/**` | `onion-architecture`, `security` |
| `server/src/db/{schema,migrations}/**` | `postgresql-table-design`, `drizzle-orm-patterns` |
| `reviewer-core/src/**` | `onion-architecture`, `typescript-expert` |
| `**/src/vendor/shared/**` | `zod` |
| any `.ts`/`.tsx` (cross-cutting) | `security`, `typescript-expert` |

Only skills whose bucket has ≥1 changed file run — no wasted passes. Before reviewing
a module, read its `INSIGHTS.md` and surface the top relevant points (repo Session
Protocol).

### 3 · Aggregate, verdict, report

Collect the LLM findings into a JSON array (contract shape) and pipe them through the
gate, which **also re-runs pre-flight and merges it in**:

```bash
echo "$LLM_FINDINGS_JSON" \
  | node .claude/skills/pr-self-review/assets/self-review.mjs gate
```

The gate writes `.devdigest/cache/self-review.json` (a `Review` that validates against
the `@devdigest/shared` contract) and a paste-ready `.devdigest/cache/self-review.md`
for the PR body, prints the summary, and:

- **BLOCK** (`request_changes`) — ≥1 CRITICAL with confidence `>= 0.8`. **Exit 1.**
- **comment** — only WARNING/SUGGESTION findings. Exit 0.
- **approve** — nothing above SUGGESTION. Exit 0.

### 4 · Act on the verdict

- **On BLOCK**: show the findings table, state `❌ BLOCKED: N critical issue(s) — not
  opening a PR`, and **do NOT run `gh pr create` / `git push`**. Fix, then re-run.
- **On approve/comment**: state `✅ Self-review passed`, then proceed. Offer the
  `self-review.md` summary for the PR body.
- **Session end**: append any genuinely new, significant learning to the touched
  module's `INSIGHTS.md` via `/engineering-insights`.

## Enforcement note

This skill is advisory (you honor the BLOCK) **plus** a runnable gate: the script
exits non-zero on BLOCK, so the same command can later be wired into a `.husky/pre-push`
hook or a PreToolUse hook on `gh pr create` / `git push` to make the gate mechanical
for the whole team. That hook wiring is intentionally **out of scope** here.

## Related skills

Domain skills invoked by routing: [`frontend-ui-architecture`](../frontend-ui-architecture/SKILL.md),
[`react-best-practices`](../react-best-practices/SKILL.md), [`next-best-practices`](../next-best-practices/SKILL.md),
[`react-testing-library`](../react-testing-library/SKILL.md), [`fastify-best-practices`](../fastify-best-practices/SKILL.md),
[`onion-architecture`](../onion-architecture/SKILL.md), [`drizzle-orm-patterns`](../drizzle-orm-patterns/SKILL.md),
[`postgresql-table-design`](../postgresql-table-design/SKILL.md), [`zod`](../zod/SKILL.md),
[`security`](../security/SKILL.md), [`typescript-expert`](../typescript-expert/SKILL.md).
Wrap-up loop: [`engineering-insights`](../engineering-insights/SKILL.md).
