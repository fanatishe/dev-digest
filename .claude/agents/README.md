# Agents

Subagents for this repo. Each runs in **its own fresh context window** — it does not see the
calling conversation, the files already read, or the skills already invoked — and returns a
structured report to the caller. Canonical location is `.claude/agents/`; shared with the
team via version control.

> Agents are registered at **session start**. A newly added agent file will not be available
> until Claude Code is restarted.

## Catalog

| Phase | Agent | Writes? | Model | Purpose |
|-------|-------|---------|-------|---------|
| Understand | [researcher](researcher.md) | no | sonnet | The **public web** — library docs, changelogs, API behaviour, versions. Reads primary sources, not snippets; checks them against the version we actually pin. A citation per claim, and an explicit list of what it could **not** find |
| Understand | [investigator](investigator.md) | no | opus | **This codebase.** Four modes: `locate` · `trace` (the call chain) · `impact` (**what breaks if I change this**) · `history` (why it came to be). Ships a Mermaid diagram. Knows the repo's search traps — `server/clones/**` is a stale copy of the whole tree, the contracts are vendored **twice**, imports go through tsconfig aliases |
| Explore | [brainstorm](brainstorm.md) | no | opus | **Best-of-N, before anything is planned.** Generates variants that must differ along a **declared axis** (not just in wording), grounds each in the files it would touch, **disqualifies** the ones breaking a hard repo rule, scores them on stated weights, and recommends one + the best idea to graft from the runner-up. Variant 0 is always *"extend what exists"* |
| Specify | [spec-creator](spec-creator.md) | `<module>/specs/**` and top-level `spec/**` only | opus | Grounds itself in the real designs, **hunts them for gaps** (missing states, edge cases, cross-module seams, UX holes), then writes a **feature spec** in **EARS** — every AC atomic, testable, carrying an `_(observable: …)_` and traced to a user story. Blocking questions come back as `CLARIFICATION_NEEDED`; smaller ones stay inline as `[NEEDS CLARIFICATION]`. Behaviour, contracts and diagrams only — **never code, never a build plan**. Hands off to `implementation-planner` |
| Plan | [implementation-planner](implementation-planner.md) | `docs/plans/**` only | opus | Reviews the requirements, flags what's unclear, and recommends a better approach; then writes an **Implementation Plan** — **multi-agent** (parallel work packages with **disjoint file ownership**) or **single-agent** (one linear task list), whichever you pick. Plans only; **never writes specs**, never edits product source |
| Build | [implementer](implementer.md) | its work package's `Owns` paths only | opus | Executes **one** work package from a plan. Its `Surface:` selects a closed skill set (backend or frontend); **all** of that set must be applied, none outside it. Writes **the AC-traceable tests the plan names** (`WP*.T*`) — broader coverage is `test-writer`'s. Gated on typecheck + tests + `pr-self-review` |
| Build | [test-writer](test-writer.md) | **test paths only** — `*/test/**`, `**/*.test.ts(x)`, `e2e/specs/*.flow.json` | opus | Picks the test **level** from the seam (unit · `.it.test.ts` · RTL · e2e flow), writes the test, runs the lane, pastes the real tail. Writes **the tests the plan did NOT name** — the adversarial edge, the seam, a bug turned into a repro; not the implementer's AC tests. **Never edits product source** — a test that fails because the code is buggy is reported as a Finding and `BLOCKED_SOURCE_BUG`; the red test stays in the tree |
| Verify | [architecture-reviewer](architecture-reviewer.md) | no | opus | Runs the shipped dependency-cruiser onion ruleset (**partitioning the known baseline**), then judges structure against the architecture skills. Advisory findings in the repo's `Finding`/`Verdict` contract. Reviews **structure, not lines** |
| Verify | [plan-verifier](plan-verifier.md) | no | sonnet | Traces **every** acceptance criterion in a plan — **or every invariant/`AC-N` in a `specs/*.md`** — to evidence: `file:line` + a verbatim quote, a named test, or a re-run command → `DONE｜PARTIAL｜MISSING｜NOT_VERIFIABLE`, then one overall **PASS/FAIL**. Run **twice**: `source=plan` (built the plan?) then `source=spec` (built what was asked?). Never fixes; never takes an implementer's report as evidence. Sonnet — a mechanical evidence-matcher, kept incorruptible by having no skills, not by model tier |
| Record | [doc-writer](doc-writer.md) | `docs/**` (not `docs/plans/**`) and `<module>/docs/**` | sonnet | Turns a landed feature, a plan, or notes into a grounded design doc with Mermaid diagrams, and links it from its index. Refuses to invent a rationale the codebase does not record |
| Record | [insights-curator](insights-curator.md) | **no** | opus | Audits `INSIGHTS.md` against its own rubric and proposes a changeset: `KEEP｜CONTRADICTED｜DUPLICATE｜STALE｜GRADUATED｜BANAL｜MISPLACED`. Its highest-value catch is **`CONTRADICTED`** — a rule a later session reversed, still being served as high-confidence guidance. Hands doc moves to `doc-writer` and INSIGHTS edits to the orchestrator |

## The write map

With eleven agents on one working tree, **disjoint write surfaces are the whole safety story.**
This is the repo's own `Owns` rule, lifted to the agent roster.

| Path | The only agent that may write it |
|---|---|
| `server/src/**`, `client/src/**`, `reviewer-core/src/**` (non-test) | `implementer` |
| `*/test/**`, `**/*.test.ts(x)`, `e2e/specs/*.flow.json` | `test-writer` |
| `docs/plans/**` | `implementation-planner` |
| `docs/**` (everything else), `<module>/docs/**` | `doc-writer` |
| `server/specs/**` · `client/specs/**` · `reviewer-core/specs/**` · `mcp/specs/**` · top-level `spec/**` | `spec-creator` |
| `e2e/specs/*.flow.json` | `test-writer` (deterministic flows — **not** prose specs) |
| `AGENTS.md` · `CLAUDE.md` · `INSIGHTS.md` · a `specs/README.md` index · package `README.md` | **no agent** — a human, or the orchestrating session via `/engineering-insights` |

**Six of the eleven write nothing at all**: `researcher`, `investigator`, `brainstorm`,
`architecture-reviewer`, `plan-verifier`, `insights-curator`. Read-only is the default here, not
the exception — an agent gets `Write` only when producing an artifact *is* the job. The five
writers each own a disjoint surface: `implementer` → source, `test-writer` → tests,
`implementation-planner` → `docs/plans`, `doc-writer` → `docs`, `spec-creator` → `specs`.

`insights-curator` is the interesting case: it exists to fix `INSIGHTS.md`, and it still may not
write it. It emits a **proposed changeset**, and the two halves go to their real owners — the
doc moves to `doc-writer` (which owns `docs/**`), the INSIGHTS edits to the orchestrating
session. That is also why it can safely preload `engineering-insights` where `doc-writer` cannot:
with no `Write` tool, the violation is structurally impossible rather than merely forbidden.

### The flow

The authoritative, step-by-step version of this — with the read-only-vs-writer race rule, the
failure loop-backs, and when to skip a phase — is the runbook at
[`../../docs/sdd-workflow.md`](../../docs/sdd-workflow.md). The diagram below is the map; the
runbook is the procedure.

```
        brainstorm ──▶ N variants, scored ──▶ one recommendation   (before anything is planned)
             │
        spec-creator ──▶ <module>/specs/SPEC-NN-<slug>.md   (EARS ACs + observables + boundaries;
             │                                               cross-module → top-level spec/)
             │            blocking Qs ⇒ CLARIFICATION_NEEDED (relayed) · smaller ⇒ [NEEDS CLARIFICATION]
             │
you ──▶ implementation-planner ──▶ docs/plans/<date>-<slug>.md   (multi-agent: WP0 + WP1..WPn, disjoint Owns
                                                                 · single-agent: one ordered task list)
                          │
        implementer(WP0)  — serial: contracts, migration, wiring
                          │           ↓ those paths are now LOCKED
                          ├──▶ implementer(WP1 · server)  ─┐
                          ├──▶ implementer(WP2 · client)  ─┼─ parallel, disjoint Owns
                          └──▶ implementer(WP3 · client)  ─┘
                          │
                          ├──▶ test-writer   — tests only; a red test caused by buggy
                          │                    source ⇒ BLOCKED, never "fixed"
                          │
        ── verify (read-only, parallel — after all writes settle) ────────────
                          ├──▶ architecture-reviewer   (depcruise + structure)
                          └──▶ plan-verifier(source=plan)   (plan criteria → evidence → PASS/FAIL)
                          │
                          ├──▶ plan-verifier(source=spec)   ← ACCEPTANCE: the spec's AC-N → evidence
                          │
                          ├──▶ pr-self-review (full branch)   ← THE GATE. the only BLOCKing check
                          │
                          ├──▶ doc-writer    — docs/** and <module>/docs/** only
                          └──▶ insights-curator — proposes; doc-writer + the orchestrator apply
                          │
        each returns a structured report + insight candidates; the orchestrating
        session appends INSIGHTS.md once (avoids a concurrent-append race)

  investigator answers "where / what calls / what breaks / why" at any point above.
  researcher answers the same shape of question about the world outside this repo.
```

Invoke an implementer with **a plan path and a work-package id** — it needs nothing else, and
will refuse to start without them. See [`docs/plans/README.md`](../../docs/plans/README.md).
`plan-verifier` takes the same plan path and audits what the implementers actually landed.

---

## What these agents are based on

All of them were designed against published guidance (retrieved 2026-07-12) and against things
this repo already had. Each design decision below traces to a source.

### Anthropic — subagent & skill mechanics

| What it says | How this repo's agents use it | Source |
|---|---|---|
| **`AskUserQuestion` is never available to a subagent**, regardless of the `tools` field | No agent can interview you mid-run. They surface questions in a returned block and stop — `researcher`/`plan-verifier`/`spec-creator` use `CLARIFICATION_NEEDED`; `implementation-planner` uses `REQUIREMENTS_NEEDED`, which the orchestrating session relays back and re-invokes with the answers. `spec-creator` splits it two ways: blocking unknowns come back in the `CLARIFICATION_NEEDED` block, smaller ones stay in the written file as `[NEEDS CLARIFICATION]` markers | [sub-agents](https://code.claude.com/docs/en/sub-agents) |
| A subagent starts with a **fresh, isolated context** — no conversation history, no files already read | The plan artifact must be **self-contained**. The implementation-planner's prompt states it outright: *"If a fact is not in the plan, it does not exist"* | [sub-agents](https://code.claude.com/docs/en/sub-agents) |
| **`skills:` preloads a skill's full text** into the subagent at startup (a preload field, not access control). A skill setting `disable-model-invocation` cannot be preloaded | `implementer` preloads all 11 domain skills (its closed set is a floor+ceiling). `implementation-planner` preloads only the **cross-cutting** ones (`onion-architecture`, `zod`, `typescript-expert`, `security`, `mermaid-diagram`, `engineering-insights`) and **invokes the seven by-artifact skills on demand** via the `Skill` tool — it still plans against the full rule set, but does not pay for the persistence/framework corpus on a single-surface change. None set `disable-model-invocation` | [sub-agents](https://code.claude.com/docs/en/sub-agents) |
| `tools` is an **allowlist**; omitting it inherits everything | Both declare an explicit, minimal list. `implementation-planner` has **no `Edit`**, and may only `Write` under `docs/plans/**` | [sub-agents](https://code.claude.com/docs/en/sub-agents) |
| **`description` is the routing signal** — write it third-person and specific, with trigger terms | Both descriptions are third-person and say *when* to use the agent | [agent-skills best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) |
| Emphasis (`IMPORTANT`, `YOU MUST`) is an endorsed tuning lever — but **prose is advisory; hooks and gates are deterministic** | The skill rules use `YOU MUST` phrasing, but enforcement does **not** rest on prose: it rests on the `pr-self-review` gate and a mandatory skill-coverage table where every skip must be justified | [skills](https://code.claude.com/docs/en/skills) |

### Anthropic — multi-agent & workflow engineering

| What it says | How this repo's agents use it | Source |
|---|---|---|
| **"Two teammates editing the same file leads to overwrites. Break the work so each teammate owns a different set of files."** | The single most load-bearing rule here. Every work package declares **`Owns`** globs, disjoint from every other WP; the plan assigns each contention file to exactly one WP | [agent-teams](https://code.claude.com/docs/en/agent-teams) |
| Give each parallel agent **an objective, an output format, tool guidance, and clear task boundaries** — without them, *"agents duplicate work, leave gaps"* | The shape of a work package: Surface · Owns · Must-not-touch · skill set · acceptance criteria | [multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) |
| **"Claude stops when the work looks done. Without a check it can run, 'looks done' is the only signal available."** | `implementer` may not report `DONE` until typecheck, the package's tests, and `pr-self-review` all pass — and must paste the real output, not paraphrase a failure as a pass | [best practices](https://code.claude.com/docs/en/best-practices) |
| Good specs **name the files and interfaces, state what is out of scope, and end with an end-to-end verification step** | Sections 2 (Non-goals), 4–5 (contracts/DB, verbatim), 6 (files per WP) and 9 (runnable verification) of the multi-agent plan template | [best practices](https://code.claude.com/docs/en/best-practices) |
| Explore → Plan → Implement → Commit; a fresh-context reviewer judges the diff against the plan, not against the reasoning that produced it | The implementation-planner/implementer split *is* this, with `pr-self-review` as the fresh-context reviewer | [best practices](https://code.claude.com/docs/en/best-practices) |
| Subagents should return **condensed, structured summaries**, not raw exploration | Both agents have rigid output templates and start at their first heading — no preamble | [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| Aim for the **"right altitude"** — specific enough to guide, flexible enough not to be brittle | The agent bodies **link** to `AGENTS.md` / `docs/` / `INSIGHTS.md` rather than duplicating them, which would go stale | [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) |
| *"Have one Claude write tests, then another write code to pass them"* — and scope the ask: *"write a test for foo.py covering the edge case where the user is logged out. **avoid mocks**"* | The `implementer` / `test-writer` split, and `test-writer`'s explicit mock-boundary rule | [best practices](https://code.claude.com/docs/en/best-practices) |
| LLM judges: use **detailed rubrics**, grade **each dimension with an isolated judge**, and *"give the LLM a way out… return 'Unknown' when it doesn't have enough information"* | Two separate reviewers rather than one — `architecture-reviewer` (structure) and `plan-verifier` (requirements). `NOT_VERIFIABLE` **is** the way out | [demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) |
| `tools` is an allowlist; *"limit tool access"*. The canonical code-reviewer example is `Read, Grep, Glob, Bash` — **no Edit/Write** | Both reviewers are strictly read-only. (The widely-copied community `architect-reviewer.md` grants `Write, Edit`; we deliberately **do not** follow it) | [sub-agents](https://code.claude.com/docs/en/sub-agents) |

### Outside research — what shaped the four newer agents

| What it says | How this repo's agents use it | Source |
|---|---|---|
| Coding agents add mocks in **36%** of test commits vs **26%** for humans, and reach for a full `mock` 95% of the time where humans spread across mock/fake/spy. The paper's own recommendation: *"include guidance on mocking best practices and anti-patterns in agent configuration files"* | `test-writer` has a mock-boundary section: fakes come from `src/adapters/mocks.ts` through the container — never `new`ed inline; mock the boundary you don't control, never the thing under test | [Are Coding Agents Generating Over-Mocked Tests?](https://arxiv.org/html/2602.00409v1) |
| The **oracle gap** — a large share of AI-authored test patches carry weak or no real assertions. The code executes; nothing is actually checked | `test-writer`'s **seven banned cheats** target assertion-weakening specifically, and its report has a mandatory `Declined to write` section for the coverage padding it refused | [Augment](https://www.augmentcode.com/guides/is-the-test-pyramid-dead) (figure not independently verified — treated as directional) |
| **Adversarial review**: *"The agent that wrote the code is compromised. It knows what it built. It'll rationalize."* Start the critic in a fresh session with only Spec + Diff. *"Favor false positives over false negatives"* | `plan-verifier` is a separate agent with a fresh context (subagents get this for free) and is explicitly **forbidden from treating the implementer's report as evidence** | [Adversarial Code Review](https://asdlc.io/patterns/adversarial-code-review/) |
| **Verification mirage**: when one session both generates and verifies, *"the verification step is contaminated by the prover's reasoning context… a consistency check over the model's own answer rather than an independent correctness check."* Mitigation is context separation — *"this can be implemented with the same model"* | Confirms the split, and confirms it costs nothing extra: `plan-verifier` runs the same model, re-reading the code from scratch | [arXiv 2605.10850](https://arxiv.org/html/2605.10850) |
| LLM judges exhibit **tone sycophancy** — they over-reward confident, authoritative phrasing over hedged but accurate answers | `plan-verifier` has a **banned-phrases** list ("looks good", "appears to be implemented", "should work") and a **default-is-MISSING** rule: nothing is DONE until evidence promotes it | [Brenndoerfer](https://mbrenndoerfer.com/writing/position-bias-in-llm-judges) |
| **"Cite or don't claim"** — every fact an agent writes into an artifact carries the `file:line` it was read from, or is flagged unverified | `plan-verifier`: *quote it or it didn't happen* (a path with no verbatim quote is `PARTIAL`, not `DONE`). `doc-writer`: the mandatory `Grounded in (read this run)` table | [van Ginkel](https://medium.com/@pvginkel/my-ai-workflow-part-5-grounding-cite-or-dont-claim-8ee3f438ce49) |
| ADRs operationalized as **fitness functions**: *"Report what you see. Do NOT rationalize away violations… Your job is to flag deviations, not to judge whether exceptions apply. Humans will decide"* | `architecture-reviewer` runs the **deterministic** depcruise check *first* and forms opinions *second* — and states outright that it is advisory, not the gate | [platformtoolsmith](https://platformtoolsmith.com/blog/operationalizing-adrs-fitness-functions/) |
| **Diátaxis** (four documentation modes); docs carry the *why*, code carries the *what*; **doc rot** is a missing feedback loop, mitigated by colocating docs with the code they describe | `doc-writer`'s refuse-to-write rules ("if a paragraph could be replaced by reading one function, delete the paragraph"), and its mandatory index-update step | [diataxis.fr](https://diataxis.fr/) · [SO blog](https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/) |

Two things the research **did not** support, recorded so nobody re-litigates them:

- The four-state `DONE｜PARTIAL｜MISSING｜NOT_VERIFIABLE` taxonomy is **not** an established named
  pattern. The closest prior art is 2-state (PASS/FAIL) and 3-state (confirmed/corrected/
  not-applicable). It is our design choice, informed by those — not a rediscovery.
- There is **no Anthropic-sanctioned template** for a test-writer or an architecture-reviewer
  subagent. Both are syntheses. Anthropic publishes the *mechanics* (subagents, tools, skills)
  and the *philosophy* (TDD as a verification loop, fresh-context review), not role templates.

### This repo

| What it is | How the agents use it |
|---|---|
| **`BUCKETS`** in [`../skills/pr-self-review/assets/self-review.mjs`](../skills/pr-self-review/assets/self-review.mjs) — commented *"File → bucket → skills. **Single source of truth**; SKILL.md mirrors this."* | Already encodes the backend/frontend skill routing, for the **review** direction. `implementer` mirrors it for the **write** direction, so a file's governing skills are the same whether you are writing it or reviewing it. Mirroring is the existing house pattern — this does not create a second source of truth |
| **[`researcher.md`](researcher.md)** — the house style | Both new agents copy its skeleton: Role → Hard constraints (explicit Bash allow/ban lists) → Interview mode → Method → rigid output templates, reusing the product's own `Verdict`/`confidence` vocabulary from `server/src/vendor/shared/contracts/findings.ts` |
| **[`pr-self-review`](../skills/pr-self-review/SKILL.md)** — the local pre-PR gate | Is the `implementer`'s exit gate. Runs dependency-cruiser (onion boundaries), typecheck + tests, a secret-scan and the shared-table guard, and **BLOCKs** on a confirmed CRITICAL finding |
| Root **[`AGENTS.md`](../../AGENTS.md)** Session Protocol | Both agents read the touched module's `AGENTS.md` + `INSIGHTS.md` and summarize the top 3 relevant points before working. `implementer` does **not** append to `INSIGHTS.md` — concurrent siblings would race on the file; it returns *insight candidates* and the orchestrator appends once. **No agent appends**, for the same reason |
| **[`TESTING.md`](../../TESTING.md)** — one suite per package; the `*.it.test.ts` suffix drives the CI unit/integration split; e2e is deterministic batch JSON | **`test-writer`'s level-selection table *is* this suite map.** The `.it.test.ts` biconditional (a test importing `test/helpers/pg.ts` *must* carry the suffix, and a test carrying it *must* need Postgres) and "never the AI `chat` command" come straight from it |
| **[`onion.dependency-cruiser.cjs`](../skills/onion-architecture/assets/onion.dependency-cruiser.cjs)** + **[`enforcement.md`](../skills/onion-architecture/references/enforcement.md)**, which records an **8-violation baseline** | **`architecture-reviewer` runs the ruleset and partitions NEW vs BASELINE.** This matters more than it sounds: `depcruise` on a *clean* `server` tree is already red (8 `routes-no-db` errors in `modules/{workspace,settings,pulls,polling}/routes.ts` — the adopt-and-fix backlog). A reviewer that doesn't partition reports 8 CRITICALs on an empty diff and is useless within a week. An out-of-scope violation **not** in the manifest is a `WARNING: the baseline has drifted` — so the manifest cannot rot silently |
| **[`findings.ts`](../../server/src/vendor/shared/contracts/findings.ts)** — `Severity`, `confidence 0..1`, `Verdict`, `FindingCategory` | Reused verbatim by `architecture-reviewer` and by `test-writer`'s source-bug report, so `pr-self-review` and the caller consume them with no translation. **`FindingCategory` is `bug｜security｜perf｜style｜test` — there is no `architecture` member, and we do not add one.** It is a *product* contract: validated at the API boundary, persisted in Postgres, and used as the reviewer LLM's structured-output schema; adding a member changes the model's output space and the stored data. Structural findings **map** instead — boundary/ring violations → `bug`, adapter & trust-boundary placement → `security`, cross-ring N+1 → `perf`, legal-but-non-idiomatic → `style`, a missing test level the architecture implies → `test` |
| **[`docs/plans/README.md`](../../docs/plans/README.md)** — the plan is the handoff contract | **`plan-verifier` parses it**: §4 contracts, §5 DB (plus the `D-NOMIGRATE` anti-requirement — an `M` on an existing migration is an automatic FAIL), §6 `Acceptance criteria` / `Tests to add` / `Owns`, §7 contention files, §9 verification → one traceable requirement each |
| **Module `docs/README.md`** — *"a single source of truth; `CLAUDE.md` links here, never copies"*, with a `## Docs` index and a "Suggested (not yet written)" line | **`doc-writer`'s placement rule** (one module's internals → that module's `docs/`; a flow crossing ≥2 packages → root `docs/`) and its **mandatory wiring step**: after writing a doc, add one line to the nearest index. A package-root README stays human-owned; an *index* README inside a docs tree is doc-writer's |
| **`server/clones/**`** — runtime data holding a **stale copy of the entire repo**, `@devdigest/shared` **copy-vendored into two trees**, cross-package imports via **tsconfig path aliases** (this is not a monorepo) | **`investigator`'s three search traps.** Each one silently produces a confident, wrong answer: a grep that hits `clones/` returns a path that isn't real; an impact analysis naming one vendored contract copy gets someone a server/client divergence; and grepping `../../reviewer-core` finds nothing because the import is `@devdigest/reviewer-core`. This is the whole reason the agent beats a plain grep |
| **[`engineering-insights`](../skills/engineering-insights/SKILL.md)** — 7 fixed sections, *"append-only; supersede with a dated note"*, **and** *"soft cap ~30 entries/file; when adding past that, prune first"* | **`insights-curator` audits against it**, and resolves the tension between those two rules explicitly: **pruning is the sanctioned escape hatch from append-only, and it is licensed only at the cap.** Below ~30 entries the curator may propose supersede-notes and graduations but **not deletions** — which is what stops a "tidy-up" from destroying a hard-won `What Doesn't Work` entry. Most `.claude/skills/` are **vendored upstream** (`fastify-best-practices` ships a `tile.json` naming `mcollina/…`), so they are **ruled out as graduation destinations** — a write there is clobbered on the next re-vendor |

### The one part not taken from any source: **WP0**

Contracts, the DB migration, and the two genuinely shared wiring files
(`server/src/modules/index.ts`, `server/src/platform/container.ts`) are exactly where
parallel implementers collide — **every new server module must register in both**. So the
implementation-planner hoists them into a serial **`WP0 — Foundation`** that lands first; those paths are
then **LOCKED**, and the implementers fan out against a stable contract and a migrated DB. An
implementer that needs a LOCKED file reports `BLOCKED` rather than editing it. (In single-agent
mode there is only one implementer, so there is no contention and no WP0 — the step *order*
carries the same contract-first, migrate-first discipline.)

Without this, file ownership breaks the first time two work packages both add a module. No
published guidance covers it — it falls out of this repo's static module registry and its
copy-vendored contracts.

---

## Skill sets — how `implementer` picks them

The WP's `Surface:` selects **exactly one** closed set, which is both a **floor** (every skill
in it must be applied) and a **ceiling** (nothing outside it may be). Shared across both sets:
`typescript-expert`, `security`, `zod`.

| Surface | Set | Always applied | Applied by artifact |
|---|---|---|---|
| `server`, `shared` (WP0) | **BACKEND** | `onion-architecture`, `typescript-expert`, `security`, `zod` | `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design` |
| `reviewer-core` | **BACKEND** (pure-core) | same | `fastify-best-practices` and `drizzle-orm-patterns` are always N/A — no HTTP, no DB |
| `client` | **FRONTEND** | `frontend-ui-architecture`, `react-best-practices`, `typescript-expert`, `security`, `react-testing-library` | `next-best-practices`, `zod` |
| `e2e` | — | `typescript-expert`, `security` | — |

Every skill in the set gets a row in the implementer's report, marked `APPLIED` (naming the
files it shaped) or `N/A` **with a reason**. There is no third option and no skill may be
omitted — so a skip is always written down and defensible, never silent.

### What the other agents preload, and why

The four newer agents don't take a closed set — they take the skills their *job* needs. The
exclusions are as deliberate as the inclusions:

| Agent | Preloads | Notably **excludes**, on purpose |
|---|---|---|
| `test-writer` | `react-testing-library`, `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `frontend-ui-architecture`, `zod`, `typescript-expert`, `security` | `postgresql-table-design` / `next-best-practices` / `react-best-practices` — it authors no schema, route or component. `pr-self-review` — its gate is explicit vitest lanes; the self-review preflight would typecheck siblings' in-flight code |
| `architecture-reviewer` | the two architecture skills, both persistence skills, `fastify`, `next`, `zod`, `typescript-expert`, `security`, `mermaid-diagram` | `react-best-practices`, `react-testing-library`. **This exclusion is what stops it becoming a second, competing code reviewer.** It reviews structure, not lines |
| `plan-verifier` | **nothing — it has no `Skill` tool at all** | *everything.* Its value is that it is an incorruptible evidence-matcher. Every skill you preload gives it another axis on which to have opinions, and opinions are how a verifier starts grading on a curve. It reads the plan and `TESTING.md`; that is enough |
| `doc-writer` | both architecture skills, both persistence skills, `zod`, `typescript-expert`, `mermaid-diagram` | `engineering-insights` — preloading a skill whose whole job is *"append to INSIGHTS.md"* into an agent **that has `Write`** and is forbidden from touching `INSIGHTS.md` is asking for the violation |
| `brainstorm` | all ten domain skills + `mermaid-diagram` | nothing — it must be able to price a variant on *any* surface. A variant that breaks the dependency rule is a dead end, and only the skills can tell it so **before** anyone writes code |
| `investigator` | `onion-architecture`, `frontend-ui-architecture`, `drizzle-orm-patterns`, `typescript-expert`, `mermaid-diagram` | the framework skills — it traces code, it does not judge it. Onion is in because *which ring a symbol sits in* determines *who is allowed to call it*, which is half of any impact analysis |
| `insights-curator` | **`engineering-insights`**, `onion-architecture`, `frontend-ui-architecture` | everything else. `engineering-insights` is the rubric it audits *against* — and it is **safe to preload here precisely because this agent has no `Write` and no `Edit`.** The doc-writer hazard above is structurally impossible for it |

## Creating a new agent

Frontmatter: `name` and `description` are the only required fields. Add `tools` (an explicit
allowlist), `model`, and `skills` (preloaded at startup — the names must match a
`SKILL.md`'s `name:` field exactly, or the preload silently fails).

Follow the house skeleton: **Role → Hard constraints → Interview mode → Method → rigid output
template.** State plainly what counts as a *successful* run and what counts as a *failed* one
— `researcher.md` is the reference. Every agent here carries that inversion in its `# Role`,
and it is load-bearing: it is what makes `BLOCKED`, `FAIL` and `DECLINED` first-class outcomes
rather than something the agent will contort itself to avoid reporting.

Before you add one, check **the write map** above. A new agent that writes must own a surface no
other agent writes — that is the invariant the whole roster rests on.
