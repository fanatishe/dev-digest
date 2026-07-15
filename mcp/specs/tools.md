# `@devdigest/mcp` — the tool contract (spec of record)

The five tools this server registers, **exactly as shipped**. This file is the spec of
record: when it and the development plan disagree, this file (and the code it describes)
wins. When it and the *code* disagree, the code wins and this file is a bug.

Every registration below is `server.registerTool(name, config, handler)` in
`src/tools/<tool>.ts`. Three package-wide rules, before anything else:

- **`inputSchema` is a RAW ZOD SHAPE** — `{ repo: repoArg }`, never `z.object({ … })`.
  Wrapping it registers fine and then produces a broken JSON Schema that fails at
  **call** time.
- **Every argument is a scalar** (P2, flat arguments). `pr` is a *union of two scalars*,
  which is still one flat argument, not a nested object.
- **Descriptions are frozen** (plan §5.0). They are loaded into the host's context at
  chat start and they are how the model *chooses between* tools — they are as
  load-bearing as the code. Do not reword them without re-reading §5.0.
- **`outputSchema` is a raw shape too**, and every tool that declares one returns
  `structuredContent` **plus** one markdown `content` block. Since L04 wired
  `get_blast_radius`, **all five tools declare one** — it was previously the sole
  exception, because a stub cannot produce a `structuredContent` to match.

Shared argument fragments live in `src/schemas.ts`:

| Fragment | Zod | Description string (rides in the JSON Schema) |
|---|---|---|
| `repoArg` | `z.string().min(1)` | `Repository as "owner/name" (e.g. "acme/payments-api") or a repo uuid.` |
| `prArg` | `z.union([z.number().int().positive(), z.string().min(1)])` | `Pull request number (e.g. 482) or a PR uuid.` |
| `agentArg` | `z.string().min(1)` | `Agent id from list_agents. An agent name also works (case-insensitive).` |
| `runIdArg` | `z.string().uuid()` | `A specific run (from run_agent_on_pr). Omit for the latest completed review.` |
| `detailArg` | `z.enum(['concise','full'])` | `concise = severity/title/file/line. full = adds rationale and suggestion.` |
| `limitArg` | `z.number().int().min(1).max(50)` | — |

---

## 1. `list_agents`

```ts
name:        'list_agents'
title:       'List reviewer agents'
description: 'List the reviewer agents configured in DevDigest. Call this first to get a valid `agent` id for run_agent_on_pr.'
inputSchema: {}                                               // zero arguments
outputSchema: { agents: z.array(AgentSummary), total: z.number().int() }
annotations: { readOnlyHint: true, openWorldHint: true }
```

Cost: **free.** `GET /agents`, via `CatalogService.listAgents()`.

**Response** (`AgentsResult`, `src/types.ts`):

```jsonc
{ "agents": [ { "id": "…uuid", "name": "security", "description": "…", "model": "…", "enabled": true } ],
  "total": 3 }
```

**`system_prompt` is stripped** — multi-KB, the single biggest response-bloat source in
this surface — along with `output_schema`, `version`, `strategy`, `ci_fail_on`,
`repo_intel` and `provider`. No `limit` and no `detail`: a workspace has a handful of
agents, so either enum would cost schema tokens on every chat and buy nothing.

*Empty:* `No reviewer agents are configured. Seed them with `cd server && pnpm db:seed`, or create one in the DevDigest UI (Agents → New), then call list_agents again.`

## 2. `run_agent_on_pr` — the only WRITE tool

```ts
name:        'run_agent_on_pr'
title:       'Run a reviewer agent on a pull request'
description: 'Run a DevDigest reviewer agent on a pull request, wait for it to finish, and return the verdict and findings. This makes a paid model call — never call it twice for the same PR and agent. Get `agent` from list_agents.'
inputSchema: { repo: repoArg, pr: prArg, agent: agentArg }
outputSchema: {
  status: RunStatusEnum, run_id: z.string(), agent: z.string(),
  verdict: VerdictEnum.nullable(), score: z.number().int().nullable(),
  summary: z.string().nullable(), findings: z.array(ProjectedFinding),
  total_findings: z.number().int(), cost_usd: z.number().nullable(),
  next: z.string().nullable(),
}
annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
```

Cost: **PAID — a real model call.** One `POST /pulls/:id/review` per invocation, never
more.

**The annotations are load-bearing.** `idempotentHint: false` is the honest signal: a
host that believed this tool idempotent would retry it and **charge the user twice**.
The description says the same thing in language the model actually reads. Belt and
braces, because the failure mode is a double charge.

**Response** (`RunOnPrResult`):

```jsonc
{ "status": "done",            // 'done' | 'failed' | 'cancelled' | 'running' (= timed out)
  "run_id": "…uuid", "agent": "security",
  "verdict": "request_changes", "score": 62, "summary": "…",
  "findings": [ /* ConciseFinding[] */ ], "total_findings": 7,
  "cost_usd": 0.0143, "next": null }
```

`ReviewService.runOnPr()` owns the whole flow (P1 — outcome, not operation): resolve
`repo`→repoId · `pr`→prId · `agent`→**agentId uuid** → `POST /pulls/:id/review` → take
`runs[0].run_id` → poll `GET /pulls/:id/runs` until it leaves `running` → `GET
/pulls/:id/reviews`, filtered `kind === 'review' && run_id === runId`.

> `POST /pulls/:id/review` is **fire-and-forget**: `ReviewRunResponse.reviews` is
> **always `[]`** (the executor runs un-awaited). Reading findings from the POST
> response is the obvious bug here, and it fails *silently*, with an empty review.

**The timeout path is `isError: false`, and `status: 'running'`.** After
`DEVDIGEST_MCP_RUN_TIMEOUT_MS` (default 180 000) the run is **not** cancelled — the model
call is already in flight and already billed; cancelling burns the spend and returns
nothing. `next` then carries:

> Review `<run_id>` is still running after 180s. It has NOT been cancelled and the model
> call is already paid for. Do NOT call run_agent_on_pr again — that starts a second
> billable review. Wait a minute, then call `get_findings(repo:…, pr:…, run_id:"<run_id>")`.

An error result invites a retry, and a retry here is a second bill. That is the entire
reason for the `isError: false`.

## 3. `get_findings`

```ts
name:        'get_findings'
title:       'Get the findings of a completed review'
description: 'Get the verdict and findings of a completed review on a pull request. Defaults to the latest completed review. Read-only — it never starts a review and costs nothing.'
inputSchema: {
  repo:   repoArg,
  pr:     prArg,
  run_id: runIdArg.optional(),
  detail: detailArg.default('concise'),
  limit:  limitArg.default(20),
}
outputSchema: {
  run_id: z.string().nullable(), verdict: VerdictEnum.nullable(),
  score: z.number().int().nullable(), summary: z.string().nullable(),
  findings: z.array(ProjectedFinding), total_findings: z.number().int(),
  next: z.string().nullable(),
}
annotations: { readOnlyHint: true, openWorldHint: true }
```

`ProjectedFinding` is `ConciseFinding` plus three **optional** fields (`confidence`,
`rationale`, `suggestion`) — so one schema covers both `detail` levels. It is
deliberately not `z.union([ConciseFinding, FullFinding])`: a union renders as `anyOf`,
which is bigger in the host's context and harder for a model to read.

Cost: **free.** `GET /pulls/:id/reviews` (already newest-first), via
`ReviewService.getFindings()`.

`"Read-only — it never starts a review and costs nothing"` is **the disambiguator**:
`get_findings` and `run_agent_on_pr` both "get findings for a PR", and without an
explicit cost contrast a model that only wants to *read* a review may reach for the tool
that *runs* one. That clause exists to lose the coin-flip on purpose.

**`detail` lives here and nowhere else.** `rationale` and `suggestion` are markdown
blobs — the only unbounded fields in the surface — so this is the one place the enum's
schema-token cost is earned.

**Response** (`FindingsResult`): `{ run_id, verdict, score, summary, findings[], total_findings, next }`.

*No review:* `PR #482 in acme/payments-api has no completed review yet. Call run_agent_on_pr (repo, pr, agent) to run one — pick an agent with list_agents.`
*Truncated:* `Showing 20 of 47 findings. Call get_findings again with limit=47 for the rest.` (in `next`)

## 4. `get_conventions`

```ts
name:        'get_conventions'
title:       'Get a repository’s extracted coding conventions'
description: 'Get the house-style coding conventions DevDigest extracted from a repository, each with the file and snippet it was grounded in. Read-only.'
inputSchema: { repo: repoArg, accepted_only: z.boolean().default(false), limit: limitArg.default(20) }
outputSchema: { repo: z.string(), conventions: z.array(ConventionSummary), total: z.number().int(), next: z.string().nullable() }
annotations: { readOnlyHint: true, openWorldHint: true }
```

Cost: **free.** `GET /repos/:id/conventions`, via `CatalogService.getConventions()`.

**Response** (`ConventionsResult`): `{ repo, conventions[], total, next }`, each convention
`{ rule, evidence_path, evidence_snippet, confidence, accepted }` — `id` and
`evidence_sha` stripped, `evidence_snippet` **truncated to 200 chars** (it is a raw file
blob).

**Read-only on purpose.** Extraction (`POST /repos/:id/conventions/extract`) is a paid
model call and is deliberately **not** exposed. This server has one write tool, and one
only.

## 5. `get_blast_radius` — WIRED (was a stub until L04)

```ts
name:        'get_blast_radius'
title:       'Get the blast radius of a pull request'
description: 'Which symbols a pull request changes, what downstream code calls them, and which HTTP endpoints and cron jobs those callers put at risk. Answers "what could this break?" — the question the diff itself cannot. Read-only and free: it reads a pre-built code index, and makes no model call.'
inputSchema: { repo: repoArg, pr: prArg }        // UNCHANGED from the stub — the point
outputSchema: { repo, pr, summary, changed_symbols, downstream, endpoints_affected,
                crons_affected, degraded, next }
annotations: { readOnlyHint: true, openWorldHint: true }
```

Cost: **free.** `GET /pulls/:id/blast-radius`, via `BlastService.getBlastRadius()`.

**Why it is free.** The API reads a pre-built index — symbols, resolved references, the
import graph, file rank and per-file endpoint/cron facts — all computed **once, when the
repo was cloned**. Nothing is analyzed at request time and no model is called. That is the
whole design: the reviewer's first question gets answered out of data already paid for.

**What the un-stubbing changed, and what it did not:**

| | Stub | Now |
|---|---|---|
| `name`, `inputSchema` | `{ repo, pr }` | **identical** — this is what freezing them bought |
| `description` | "…NOT IMPLEMENTED YET" | rewritten (a frozen description that lies is worse than an edited one) |
| `outputSchema` | absent — a stub has no `structuredContent` to match | declared |
| `isError` | `true` | gone — a degraded index is a partial answer, not a failure |
| `ApiPort` / service | none | `getBlastRadius(prId)` + `BlastService` |

The three steps the stub's own message promised were exactly the three that landed: a
route in `server` (`modules/pulls/routes.ts` — **not** `repo-intel/routes.ts`, since it is
PR-scoped and follows the Smart Diff precedent), `getBlastRadius()` on `ApiPort` +
`http-client.ts`, and a service. `blast-radius.test.ts` still asserts the input-schema keys
are exactly `['repo', 'pr']`.

**`degraded` is the field that matters.** An unindexed repo produces an **empty** blast
radius — which on the wire is indistinguishable from *"nothing is affected"*, the most
dangerous thing this tool could imply. So `degraded: true` is surfaced explicitly and
`next` says it out loud ("an empty result here means *unknown*, not *nothing is
affected*") and names the fix (re-analyze / `POST /repos/:id/resync`).

**Projections** (§5.6): `downstream` is capped at 10 symbols and each symbol's callers at
8, but every entry carries `total_callers` **before** the cap — a truncation a model cannot
see is a truncation it will reason past. A caller is folded to `{ name, at: "file:line" }`.

---

## Cross-cutting: the response rules

- **Nothing raw goes on the wire.** Every response is a projection (`src/format.ts`):
  `system_prompt` stripped, `evidence_snippet` truncated to 200 chars, `start_line` +
  `end_line` folded into one `lines` string ("42" or "42-58"), and `id` / `review_id` /
  `accepted_at` / `dismissed_at` / `kind` / `trifecta_components` / `evidence` dropped.
- **`content` is a markdown summary, never `JSON.stringify(structuredContent)`.** The
  spec says a structured tool SHOULD also emit text; emitting the same JSON twice doubles
  the token cost for zero gain.
- **Every list carries a cap and an honest hint.** `limit` defaults to 20, maxes at 50,
  and a truncated list says *"Showing 20 of 47 … call again with limit=47"*. A hint that
  fires on a complete list is a lie that costs a wasted call, so it is `null` then.
- **Errors lead onward** (P4). Every failure names the next tool or command:
  `list_agents`, `get_findings`, `run_agent_on_pr`, `get_conventions`, `./scripts/dev.sh`,
  or the DevDigest UI. The catalogue is `src/errors.ts`; `errors.test.ts` asserts it
  message by message.
