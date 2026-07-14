# CLAUDE.md — DevDigest (root map)

Local-first AI pull-request review. **Import a PR → run an agent review → get
grounded, structured findings.** This repo is a course starter; most empty tables
and unused contracts are scaffolding for later lessons (L01–L08), not dead code.

> This file is a **map, not documentation**. It loads every session — keep it lean
> (≤100 lines). Put here only what can't be inferred from the code; link the rest.

## Stack

- **server** `@devdigest/api` — Fastify 5 · Drizzle · Postgres+pgvector · Zod (`:3001`)
- **client** `@devdigest/web` — Next.js 15 · React 19 · TanStack Query (`:3000`)
- **reviewer-core** `@devdigest/reviewer-core` — pure engine, injected LLMProvider
- **e2e** `@devdigest/e2e` — Vercel agent-browser (Rust+CDP), deterministic
- **mcp** `@devdigest/mcp` — local MCP server (stdio), reaches the API over HTTP only
- Node ≥ 22 · pnpm ≥ 10 · Docker (Postgres only)

## Repo-wide conventions (non-default — read before assuming)

- **Not a monorepo.** Each package has its own `package.json`/lockfile. Cross-package
  code is shared via **tsconfig path aliases** (`@devdigest/reviewer-core`,
  `@devdigest/shared`), consuming TS **source** directly — no build/publish step.
- **`@devdigest/shared`** (Zod contracts) is the one schema every package agrees on.
  It lives at `server/src/vendor/shared` and is copy-vendored into the client.
- **Secrets never touch git or the DB** — they live in `~/.devdigest/secrets.json`
  (mode 0600) via `LocalSecretsProvider`, `process.env` as fallback.
- **The DB schema pre-declares EVERY table** (`server/src/db/schema.ts`). Unused ones
  sit empty until a lesson fills them. **Extend with new tables/columns — never
  migrate the existing shared tables.**
- **No auth** — `LocalNoAuthProvider` returns one seeded user/workspace.

## Commands

- `./scripts/dev.sh` — Postgres + API + web, seeded. Flags: `--no-seed --no-client --db-only`.
- Migrations are **not** applied on boot: `cd server && pnpm db:migrate`.
- `./scripts/e2e.sh` — hermetic e2e stack (never touches your dev DB).
- **Never `docker compose down -v`** — `-v` deletes the volume and every imported repo/review.

## Module conventions live in the module's own CLAUDE.md

Do not duplicate module rules here. Each is auto-loaded when you work in that folder:
`server/CLAUDE.md` · `client/CLAUDE.md` · `reviewer-core/CLAUDE.md` · `e2e/CLAUDE.md` ·
`mcp/CLAUDE.md`.

Each module also carries `docs/` (design SoT), `specs/` (contracts), and an
append-only `INSIGHTS.md` (engineering learnings). Link to them — don't copy them here.

## Session Protocol (engineering-insights loop)

Knowledge compounds per module via `<module>/INSIGHTS.md`. See
`.claude/skills/engineering-insights/SKILL.md`.

- **At session start** — before working in a module (`server` · `client` ·
  `reviewer-core` · `e2e` · `mcp`), read that module's `INSIGHTS.md` and **summarize the top 3
  most relevant points** for the task. Treat entries as high-confidence guidance unless
  told otherwise.
- **At session end** — run `/engineering-insights`: identify new patterns / mistakes /
  decisions and **append** them to the right section of the touched module's
  `INSIGHTS.md`. **Never overwrite** — correct a stale entry with a dated note. Append
  only if genuinely significant; if nothing new, write nothing. Do not skip this step.

## Read when

- Understanding the whole system → `README.md` (architecture + flow diagrams)
- Working on tests or CI → `TESTING.md` (one suite per package, path-filtered)
- Writing/editing a reviewer agent prompt → `docs/agent-prompts/README.md`
- Anything module-specific → that module's `CLAUDE.md` (then its `docs/`/`specs/`)
