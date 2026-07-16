# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Onion/ports-and-adapters layering for `server` + `reviewer-core` — where code goes, the dependency-inward rule, tool-per-layer, dependency-cruiser enforcement |
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [frontend-ui-architecture](frontend-ui-architecture/SKILL.md) | Frontend | Code structure & organization — folder layout, thin pages, colocation, where constants/helpers/styles/logic/hooks live |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [engineering-insights](engineering-insights/SKILL.md) | Meta | Per-module capture-learnings loop — read `<module>/INSIGHTS.md` at session start, append significant learnings at session end |
| [pr-self-review](pr-self-review/SKILL.md) | Meta | Local pre-PR gate — diff vs main, route changed files to the domain skills, run deterministic checks (onion/typecheck/tests/secrets/schema), BLOCK the PR on a critical finding |
| [sdd-implement](sdd-implement/SKILL.md) | Meta | Runs the execution half of the SDD pipeline from an approved plan — fans `implementer`s out over the work packages, runs the verifiers once writes settle, loops on `architecture-reviewer`'s advisory comments, checks the spec, runs the `pr-self-review` gate. Main-loop only (spawns subagents, asks you questions); pauses at the seams; writes nothing itself and never commits |

## Agents

Subagents live in [`.claude/agents/`](../agents/). Each runs in its own fresh context window
and returns a structured report to the caller.

| Phase | Agent | Purpose |
|-------|-------|---------|
| Understand | [researcher](../agents/researcher.md) | Read-only. The **public web** — docs, changelogs, API behaviour, versions. A source per claim, checked against the version we pin; never writes, never guesses |
| Understand | [investigator](../agents/investigator.md) | Read-only. **This codebase** — `locate` · `trace` · `impact` (what breaks if I change this) · `history`. Ships a Mermaid diagram, and knows the repo's search traps (`server/clones/**`, the twice-vendored contracts, tsconfig aliases) |
| Explore | [brainstorm](../agents/brainstorm.md) | Read-only. **Best-of-N before anything is planned.** Variants must differ along a **declared axis**; each is grounded in real files; ones breaking a hard repo rule are **DISQUALIFIED**, not just scored low. Weights stated before scores |
| Plan | [implementation-planner](../agents/implementation-planner.md) | Reviews the requirements, clarifies gaps, recommends a better approach, then writes an Implementation Plan to `docs/plans/<date>-<slug>.md` — **multi-agent** (work packages with **disjoint file ownership**, run in parallel) or **single-agent** (one linear task list), whichever you pick. Plans only; **never writes specs**, never edits product source |
| Build | [implementer](../agents/implementer.md) | Executes **one** work package from a plan. Its `Surface:` selects a closed skill set (backend or frontend) — **all** of that set must be applied, none outside it. Gated on typecheck + tests + `pr-self-review` |
| Build | [test-writer](../agents/test-writer.md) | Picks the test **level** from the seam (unit · `.it.test.ts` · RTL · e2e flow), writes it, runs the lane. **Writes tests and nothing else** — a test that fails because the source is buggy is reported as a Finding and blocks; the red test stays in the tree |
| Verify | [architecture-reviewer](../agents/architecture-reviewer.md) | Read-only. Runs the shipped dependency-cruiser onion ruleset (partitioning the known 8-violation baseline), then judges **structure, not lines**. Advisory — `pr-self-review` is the gate |
| Verify | [plan-verifier](../agents/plan-verifier.md) | Read-only. Traces **every** acceptance criterion in a plan — or every invariant in a `specs/*.md` — to evidence → `DONE｜PARTIAL｜MISSING｜NOT_VERIFIABLE` → one **PASS/FAIL**. Cites `file:line` + a verbatim quote for each. Never takes an implementer's report as evidence |
| Record | [doc-writer](../agents/doc-writer.md) | Turns a landed feature, a plan, or notes into a grounded design doc with Mermaid diagrams, under `docs/**` and `<module>/docs/**` only. Refuses to invent a rationale the codebase does not record |
| Record | [insights-curator](../agents/insights-curator.md) | Read-only. Audits `INSIGHTS.md` and proposes a changeset — `KEEP｜CONTRADICTED｜DUPLICATE｜STALE｜GRADUATED｜BANAL｜MISPLACED`. Catches the rule a later session **reversed** but nobody retracted. Proposes; `doc-writer` and the orchestrator apply |

The end-to-end pipeline — phase order, the read-only-vs-writer race rule, the failure
loop-backs, and the gate — is the **runbook** at [`docs/sdd-workflow.md`](../../docs/sdd-workflow.md).
That is the single source of truth; do not restate the sequence here or it will drift.

**Every agent that writes owns a surface no other agent writes** — that write map is in
[`.claude/agents/README.md`](../agents/README.md), along with what each agent is based on (with
sources). See [`docs/plans/README.md`](../../docs/plans/README.md) for the plan format.

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
