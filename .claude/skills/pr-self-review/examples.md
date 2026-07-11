# pr-self-review — worked runs

Two end-to-end runs: one that **passes**, one that **blocks**. Commands are exactly
what the skill runs; output is trimmed for brevity.

---

## Example A — PASS (a small, clean client change)

Branch adds a helper + its test under `client/src/lib/`.

### 1 · classify

```console
$ node .claude/skills/pr-self-review/assets/self-review.mjs classify
Changed files (2) vs merge-base(main) + working tree:

  [A] client/src/lib/format-bytes.ts       → react-best-practices, frontend-ui-architecture, security, typescript-expert
  [A] client/src/lib/format-bytes.test.ts  → react-testing-library, security, typescript-expert

Skills to invoke (over changed hunks only):
  • react-best-practices  (1 file)
  • frontend-ui-architecture  (1 file)
  • react-testing-library  (1 file)
  • security  (2 files)
  • typescript-expert  (2 files)

Deterministic checks will cover packages: client
```

### 2b · route to skills (Skill tool)

Invoke each listed skill over the two files' hunks. Suppose they surface only one
`SUGGESTION` (prefer `Intl.NumberFormat`) — recorded at confidence 0.7.

### 3 · gate

```console
$ echo '[{"id":"ui-1","severity":"SUGGESTION","category":"style","title":"Prefer Intl.NumberFormat","file":"client/src/lib/format-bytes.ts","start_line":4,"end_line":9,"rationale":"...","confidence":0.7}]' \
    | node .claude/skills/pr-self-review/assets/self-review.mjs gate
## ✅ Self-review: passed

Score: 98/100 — verdict `approve`.
...
$ echo $?
0
```

Pre-flight (client typecheck + vitest) passed, no CRITICALs → verdict `approve`.

**Action:** `✅ Self-review passed` → proceed to `gh pr create`, offering
`.devdigest/cache/self-review.md` for the PR body.

---

## Example B — BLOCK (backend change trips two deterministic checks)

Branch adds a route that imports Drizzle directly **and** renames a column in an
existing schema file.

### 1 · classify

```console
$ node .claude/skills/pr-self-review/assets/self-review.mjs classify
  [M] server/src/modules/reviews/routes.ts  → fastify-best-practices, onion-architecture, security, typescript-expert
  [M] server/src/db/schema/reviews.ts       → postgresql-table-design, drizzle-orm-patterns, security, typescript-expert
Deterministic checks will cover packages: server
```

### 2a · pre-flight (no LLM needed to fail)

```console
$ node .claude/skills/pr-self-review/assets/self-review.mjs preflight
[
  {
    "severity": "CRITICAL",
    "category": "bug",
    "title": "Onion boundary violation: routes-no-db",
    "file": "server/src/modules/reviews/routes.ts",
    "rationale": "routes.ts is the transport ring... — imports `drizzle-orm`.",
    "confidence": 1
  },
  {
    "severity": "CRITICAL",
    "category": "bug",
    "title": "Altering an existing shared table",
    "file": "server/src/db/schema/reviews.ts",
    "rationale": "This edit removes/changes existing lines in a pre-declared schema file...",
    "confidence": 0.85
  }
]
```

### 3 · gate

```console
$ node .claude/skills/pr-self-review/assets/self-review.mjs gate < /dev/null
## ❌ Self-review: BLOCKED (2 critical)

Score: 20/100 — verdict `request_changes`.

| Severity | Conf | Location | Finding |
|---|---|---|---|
| CRITICAL | 1 | `server/src/modules/reviews/routes.ts`:1 | Onion boundary violation: routes-no-db |
| CRITICAL | 0.85 | `server/src/db/schema/reviews.ts`:1 | Altering an existing shared table |

❌ BLOCKED: 2 critical issue(s) — do NOT open the PR.
$ echo $?
1
```

**Action:** exit code `1` → **do not** run `gh pr create`. Report the two CRITICALs,
fix them (delegate the DB write to a `service → repository`; add a new column via a
new migration instead of renaming), then re-run the gate.

> Here the block came entirely from deterministic pre-flight — no LLM pass was even
> required. The LLM skills still run to enrich the report, but the gate was already
> decided.
