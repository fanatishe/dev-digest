# Backend tools → which ring they belong to

The confirmed backend tool inventory (from `server/package.json` and
`reviewer-core/package.json`), grouped by the onion ring each is allowed in. The
rule is simple: **a tool may only be imported from the ring(s) listed here.** The
`dependency-cruiser` ruleset ([`../assets/onion.dependency-cruiser.cjs`](../assets/onion.dependency-cruiser.cjs))
encodes the forbidden combinations.

## HTTP / transport ring only

| Tool | Version | Notes |
|---|---|---|
| `fastify` | `^5.2.0` | Routes, `app.ts`, `server.ts` only. Never in service/repo/core. |
| `@fastify/autoload` | `^6.0.3` | Plugin loading in `app.ts`. |
| `@fastify/cors` | `^10.0.2` | Registered before modules. |
| `@fastify/helmet` | `^13.0.2` | Security headers. |
| `@fastify/rate-limit` | `^11.0.0` | Global 120/min (off in tests). |
| `fastify-sse-v2` | `^4.2.1` | SSE streaming for run events. |
| `fastify-type-provider-zod` | `^4.0.2` | One Zod contract → validation + serialization. |

## Contracts ring (crosses all rings as the shared language)

| Tool | Version | Notes |
|---|---|---|
| `zod` | `^3.24.1` | Schemas/contracts in `@devdigest/shared`. Types allowed in core; keep runtime parsing at the edges (routes). |

## Infrastructure / adapters ring only

| Tool | Version | Ring location |
|---|---|---|
| `drizzle-orm` | `^0.38.3` | `repository.ts`, `db/**` only. Never in routes/service/core. |
| `postgres` (driver) | `^3.4.5` | `db/client.ts` only. |
| `drizzle-kit` | `^0.30.1` | Migrations/codegen (`pnpm db:generate`), not app code. |
| `@anthropic-ai/sdk` | `^0.33.1` | `adapters/llm/anthropic.ts`. |
| `openai` | `^4.77.0` | `adapters/llm/openai.ts`, `adapters/embedder/openai.ts`. |
| OpenRouter provider | — | Lives in `reviewer-core` (shared w/ CI), wired via container. |
| `octokit` | `^4.0.3` | `adapters/github/octokit.ts`. |
| `simple-git` | `^3.27.0` | `adapters/git/simple-git.ts`. |
| `@vscode/ripgrep` | `^1.15.9` | `adapters/codeindex/ripgrep.ts`. |
| `@ast-grep/napi` | `0.43.0` | `adapters/astgrep/**`. |
| `dependency-cruiser` | `^17.4.3` | `adapters/depgraph/**` (and **this skill's** arch check). |
| `graphology` (+`-metrics`) | `^0.26.0` | PageRank in repo-intel pipeline. |
| `js-tiktoken` | `^1.0.21` | `adapters/tokenizer/**`. |
| `p-queue` | `^8.0.1` | `platform/jobs.ts` job queue (application/infra edge). |
| `octokit`/`simple-git`/SDKs | — | Always behind a `@devdigest/shared` interface. |

## Domain core ring (`reviewer-core`)

| Tool | Version | Notes |
|---|---|---|
| `openai` | `^4.77.0` | **Only** the OpenRouter/OpenAI-compatible client for structured output, reached through the injected `LLMProvider`. No DB/GitHub/fs. |
| `zod` | `^3.24.1` | Type shapes / contract inference. |

> `reviewer-core` deliberately has a tiny dependency set — that small surface is
> the proof of its purity. Adding `postgres`, `octokit`, `simple-git`, or
> `fastify` here is a hard violation.

## Tests (orthogonal to rings)

| Tool | Version | Notes |
|---|---|---|
| `vitest` | `^2.1.8` | Both packages. `*.it.test.ts` = DB-backed. |
| `@testcontainers/postgresql` / `testcontainers` | `^10.16.0` | Real Postgres for integration tests. |
| `tsx` | `^4.19.2` | TS execution (dev + tests). |
| `pino-pretty` | `^13.0.0` | Dev logging. |

## Quick "may I import X here?" table

| From ring ↓ / import → | Fastify | Drizzle/`postgres` | LLM/GitHub/git SDKs | Zod contracts | Domain core |
|---|:--:|:--:|:--:|:--:|:--:|
| HTTP (`routes.ts`) | ✅ | ❌ | ❌ | ✅ | ✅ (via service) |
| Application (`service.ts`) | ❌ | ❌ | ❌ (use container) | ✅ | ✅ |
| Infra (`repository.ts`, `adapters/**`) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Domain core (`reviewer-core`, `helpers.ts`) | ❌ | ❌ | ❌ | ✅ | ✅ |
