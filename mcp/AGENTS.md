# CLAUDE.md — mcp (`@devdigest/mcp`)

A local **MCP server over stdio** that exposes DevDigest's reviewer to any MCP host
(Claude Code, Claude Desktop). Read `../CLAUDE.md` first. Map, not docs — keep ≤100
lines; link, don't copy.

## Commands

- `npm run typecheck` · `npm test` (vitest — no network, no live API, no MCP SDK in
  the service tests) · `npm run arch:check` (dependency-cruiser, the onion).
- **The root `.mcp.json` loads it in every Claude Code session** in this repo (approve the
  trust prompt once). Turn it off with `{"disabledMcpjsonServers": ["devdigest"]}` in
  `.claude/settings.local.json`. `scripts/dev.sh` does **not** start it — the **host**
  spawns it over stdio and kills it with the session; only the API (`:3001`) is yours to run.
- Drive it without a host: `./scripts/mcp.sh {check|tools|call|inspect}` — e.g.
  `./scripts/mcp.sh call get_findings '{"repo":"owner/name","pr":3}'`.
- Run it raw: `npx tsx src/index.ts` — it blocks on stdio; the ready line is on **stderr**.

## The three rules that will bite you (non-default)

- **STDOUT BELONGS TO JSON-RPC.** One `console` log call to stdout anywhere in this
  package corrupts the protocol frame and the host dies with an opaque parse error.
  **All logging is `console.error` (stderr).** `npm run purity:check` greps for it and
  CI runs that check — as it does `arch:check`. (Until 2026-07-14 both claims were false:
  CI ran only typecheck + tests, so the package's worst failure mode was guarded by
  nothing automatic.)
- **`inputSchema` is a RAW ZOD SHAPE** — `{ repo: repoArg }`, never
  `z.object({ … })`. Wrapping it produces a broken JSON Schema that fails at **call**
  time, not at registration. Use `server.registerTool(...)`; `server.tool(...)` is
  `@deprecated`.
- **`@devdigest/shared` is TYPES ONLY**, and only in `src/types.ts`, only on an
  `import type` line. A value import loads a second zod (server ^3.24, mcp ^3.25) and
  breaks `instanceof`. And **do not re-`.parse()` API responses** — the API already
  validated them on the way out. Type them; don't re-parse them.

## The onion (mirrors `server`'s rings — `.dependency-cruiser.cjs` enforces it)

| Ring | Files | Rule |
|---|---|---|
| Domain (pure) | `format.ts` `errors.ts` `schemas.ts` | no fetch, no env, no fs, no SDK |
| Ports | `ports.ts` (`ApiPort`) · `types.ts` | interfaces + types only |
| Application | `services/*.ts` · `resolve.ts` · `wait.ts` | takes the **port**, never the impl |
| Infrastructure | `api/http-client.ts` · `config.ts` | the **only** `fetch()`; the only `process.env` |
| Transport | `index.ts` · `tools/*.ts` | the MCP SDK; a handler is schema → one service call → format |

`index.ts` is the **composition root** (the `platform/container.ts` analogue): the only
place that `new`s the HTTP client. That is why services are tested against a plain mock
`ApiPort` object — no `fetch` stubbing, no HTTP.

## Money & correctness gotchas

- **`run_agent_on_pr` is the only write tool, and it costs real money.** One
  `POST /pulls/:id/review` per invocation. On timeout we do **not** cancel and do
  **not** retry — we return `isError: false` and point at `get_findings`. An error
  result invites a retry, and a retry here is a **second bill**.
- **`POST /pulls/:id/review` is fire-and-forget**: its `reviews` array is always `[]`.
  Findings come only from `GET /pulls/:id/reviews`, after the run leaves `running`.
- **`GET /repos/:id/pulls` is heavyweight** — it syncs from GitHub *and* enqueues a
  billable intent job. Hence the **60s TTL cache in `api/http-client.ts`** (an
  infrastructure concern, not a service one): one tool call resolves a PR once.
- **Never forward a non-uuid agent id.** `agents.id` is a `uuid` column and
  `RunRequest.agentId` is a bare `z.string()` — a name reaches Postgres as
  `invalid input syntax for type uuid` → a **500**. `resolve.ts` resolves first, always.
- **Errors lead onward** (P4): every message names the next tool or command
  (`list_agents`, `get_findings`, `./scripts/dev.sh`, the DevDigest UI). `errors.test.ts`
  asserts it.
- **Responses are projections, never raw records.** `system_prompt` is stripped;
  `evidence_snippet` is truncated to 200 chars; lists carry a limit + an "N more"
  hint. The markdown `content` block is a summary — **never `JSON.stringify` of the
  `structuredContent`** (that doubles the token cost for zero gain).

## Read when

- The tools, their frozen descriptions and the design → `README.md`, `docs/`, `specs/`
- The full plan (rings, WPs, verification) → `../docs/plans/2026-07-13-mcp-server.md`
- Something behaves oddly (zod/tsconfig/SDK quirks) → `INSIGHTS.md`
