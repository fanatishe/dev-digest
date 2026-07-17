# Workflow Retros

A **retro** is a post-run retrospective over a multi-agent / `Workflow` session, produced by the
[`workflow-retro`](../../.claude/skills/workflow-retro/SKILL.md) skill. It evaluates the **run** —
how the work was fanned out across subagents, what it cost, where it struggled, what it duplicated,
and what to change next time — **not** the code the run produced (that is `pr-self-review` and the
architecture reviewer) and **not** durable code learnings (those go to a module's `INSIGHTS.md` via
`engineering-insights`).

Each file is named `<YYYY-MM-DD>-<slug>.md`, matching the `docs/plans/` convention — the date the
retro was written and a kebab-case slug for what the run was doing. The skill writes one here after a
run when you explicitly ask for a retro (it is **manual only** — never run automatically), and adds a
link line below. Retros are **not committed by the skill**; they are left in the working tree.

## Index

<!-- workflow-retro appends one line per retro here: `- [<date> — <what the run was>](<file>.md)` -->

- [2026-07-17 — spec-creator authoring SPEC-01-project-context (3 dispatches, fully serial)](2026-07-17-spec-creator-run.md)
- [2026-07-17 — SDD build of Project Context (SPEC-01): 23 agents, base plan + addendum + design corrections](2026-07-17-project-context-sdd-build.md)
- [2026-07-17 — Risk Brief: full SDD build of an LLM feature, then reverted to a findings-derived redesign (~1.2M of ~1.42M tokens discarded)](2026-07-17-risk-brief-build-and-redesign.md)
