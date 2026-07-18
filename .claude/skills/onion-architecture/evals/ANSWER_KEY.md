# Answer key — planted violations per fixture

Maintainer reference. **This file is deliberately kept out of `fixtures/`** so the
fixtures a run reviews contain no hints about what is wrong. Update it whenever a
fixture changes.

Each fixture is realistic DevDigest backend code presented as a pre-PR review.
"Clean" items are decoys: a precise reviewer must leave them alone (precision), so
several evals assert on *not* flagging them.

## 01-pulls-route/routes.ts — HTTP ring leaks the DB

| Line(s) | Planted violation | Rule |
|---|---|---|
| `import ... drizzle-orm`, `db/client.js`, `db/schema.js` | infra imports in the transport ring | `routes-no-db` |
| `db.select()...` in `GET /pulls`, `db.select()`/`db.insert()` in `POST /pulls` | raw queries inside route handlers | `routes-no-db` |
| row→DTO mapping inline in the handler | logic that belongs in a repository/helper | (placement) |

Fix: add `repository.ts` (the queries) + `service.ts` (orchestration); route calls the service.
Clean: the Zod `schema` on each route and the status codes are correct HTTP-ring concerns — do not flag.

## 02-repos-service/service.ts — application ring builds adapters

| Line(s) | Planted violation | Rule |
|---|---|---|
| `import { SimpleGitClient }` + `new SimpleGitClient(...)` in `cloneRepo` | service constructs a concrete git adapter | `service-no-external-sdk` / depend-on-interface |
| `import { OpenAIProvider }` + `new OpenAIProvider(...)` in `summarize` | service constructs a concrete LLM adapter | `service-no-external-sdk` |
| `process.env.OPENAI_API_KEY` in the service | secret read in the application ring (should be a `SecretsProvider`) | (secrets) |

Fix: use `this.container.git` and `await this.container.llm('openai')`.
**Clean (decoy):** `new RepoRepository(container.db)` — a service constructing its own repository IS the allowed pattern (see examples.md §2). `parseRepoUrl` (pure helper) and `CLONE_DEPTH` are fine. Flagging these = a precision miss.

## 03-core-run/run.ts — reviewer-core reaches for I/O

| Line(s) | Planted violation | Rule |
|---|---|---|
| `import postgres` + module-level `sql = postgres(...)` + `insert into reviews` | DB in the pure core | `core-purity-no-io` |
| `import { Octokit }` + `new Octokit(...)` + `createComment` | GitHub in the pure core | `core-purity-no-io` |
| `process.env.DATABASE_URL` / `process.env.GITHUB_TOKEN` | env/I/O in the core | `core-purity-no-io` |

Fix: return the `Review`; the caller persists (server) and posts (CI runner).
**Clean (decoy):** `args.llm.complete(...)` (the injected LLMProvider — the core's one allowed side effect), and `assemblePrompt` / `groundFindings` / `recomputeScore` (pure). Do not flag.

## 04-agents-module — impure helper beside clean code

| File / line(s) | Planted violation | Rule |
|---|---|---|
| `helpers.ts` `resolveDefaultModel` — `import db/client` + drizzle + `db.select()` | I/O in a pure helper | `helpers-must-stay-pure` |

Fix: move the lookup to a repository/service; keep helpers pure.
**Clean (decoys) — must NOT be flagged:**
- `helpers.ts` `toAgentDto` (pure DTO map) and `AGENT_JOB_KIND` (constant).
- `routes.ts` — thin, delegates to `AgentService`, no DB/SDK imports. Entirely conforming.

## 05-reviews-service/service.ts — cross-module infra reach (NEW capability)

Exercises `no-cross-module-internals`, added in the new skill version. Note (from
iteration 1): a strong reviewer catches the cross-module reach from general
encapsulation principles *even without the rule* — so the delta is NOT detection.
The old skill flags it only as a **WARNING** and explicitly notes it "passes
arch:check cleanly"; the new skill rates it **CRITICAL** and ties it to the
mechanical depcruise edge. Hence the two extra assertions on this case (severity +
mechanical enforcement) — that is where the new capability actually moves the needle.

| Line(s) | Planted violation | Rule |
|---|---|---|
| `import { RepoRepository } from '../repos/repository.js'` + `new RepoRepository(container.db)` + `this.repos.findById(...)` | reviews module reaches into the **repos** module's private repository | `no-cross-module-internals` |

Fix: call the `repos` module's `service` (its public seam) or a shared
`@devdigest/shared` port for the repo metadata; do not import another slice's repository.
**Clean (decoys) — must NOT be flagged:**
- `new ReviewRepository(container.db)` — the reviews module using its OWN repository is allowed.
- `this.container.git.diff(...)` / `await this.container.llm('openai')` — correct DI resolution.
- `reviewPullRequest(...)` from `@devdigest/reviewer-core` — application ring calling the pure domain core, correct.

## 06-runs-module — laundered DB query through a presenter (COMPLEX, larger fixture)

Exercises `db-toolkit-only-in-repository` + the "trace one hop deeper" guidance,
added in the new skill version. Five files; the violation surfaces only if the
reviewer reads across them — `routes.ts` and `service.ts` look clean.

| File / line(s) | Planted violation | Rule |
|---|---|---|
| `presenter.ts` — `import { eq, inArray } from 'drizzle-orm'` + `import { findings, reviews } from '../../db/schema'` + two `db.select()...` queries in `enrichRunView` | a **presenter** (not a repository) imports the DB toolkit and runs queries — laundered I/O in the wrong ring | `db-toolkit-only-in-repository` |
| `service.ts` `getRunView` — `return enrichRunView(run, this.container.db)` | the service hands the raw `container.db` to a presenter — the laundering enabler that makes the thin route transitively reach the DB | (transitive-leak reasoning) |

Fix: move the enrichment `select`s into `RunRepository` (a method / join); `enrichRunView`
becomes a pure mapper taking already-fetched data. The service calls the repository and
passes plain data to the presenter.

**Clean (decoys) — must NOT be flagged:**
- `repository.ts` — imports the SAME `drizzle-orm` + `db/schema` and runs `select`/`insert`. This is **correct**: repository.ts is the one legal caller of the DB toolkit. Flagging it = the key precision miss for this case.
- `constants.ts` — pure literals (`RUN_JOB_KIND`, `MAX_RUNS_PER_PAGE`, `RUN_STATUSES`).
- `routes.ts` — thin transport, delegates to the service, no DB/SDK imports.
- The DTO-shaping inside `enrichRunView` (mapping rows → `RunView`) is fine per se — only the **queries** are the violation.
