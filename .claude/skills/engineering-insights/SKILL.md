---
name: engineering-insights
description: >-
  Captures and recalls per-module engineering insights in each module's
  INSIGHTS.md (server, client, reviewer-core, e2e). Use at the START of any
  coding or debugging task to read the touched module's INSIGHTS.md and
  summarize the top 3 relevant points, and at the END of a session to append new,
  significant, non-obvious learnings (patterns that worked, dead ends, gotchas,
  recurring errors, decisions). Append-only; read before writing to avoid
  duplicates. Skip when nothing significant was learned.
---

# Engineering Insights — per-module capture-learnings loop

Persist what a session learns so the next session in that module starts informed
instead of re-deriving it. Knowledge compounds **per module**: each module keeps its
own `INSIGHTS.md` next to its code, and a session reads only the file(s) for the
module it touches.

This is knowledge that changes session to session (discoveries, gotchas, decisions) —
**not** stable config (that stays in `CLAUDE.md`) and **not** a chat replay (extract the
insight, not the history).

## Where insights live

One append-only `INSIGHTS.md` per module root:

| Task touches… | Write to |
|---|---|
| `@devdigest/api` server code, DB, repo-intel subsystem | `server/INSIGHTS.md` |
| `@devdigest/web` Next.js client | `client/INSIGHTS.md` |
| `@devdigest/reviewer-core` engine | `reviewer-core/INSIGHTS.md` |
| `@devdigest/e2e` flows/runner | `e2e/INSIGHTS.md` |

A task spanning two modules writes to **each** relevant file. Root-only work
(scripts/docs/CLAUDE.md) goes to the module it most affects — or nowhere if trivial.
If a module has no `INSIGHTS.md` yet, create it from
`assets/templates/_insights-template.md`.

## When to Apply

- **Session start (recall)** — before editing or reasoning about a module, read that
  module's `INSIGHTS.md` and **summarize the top 3 most relevant points** for the task.
  This forces active processing and confirms the file actually loaded. Treat entries as
  high-confidence guidance unless told otherwise.
- **Session end (capture)** — for any session >~30 min where you hit a problem, made a
  decision, or discovered something, append what's new. Invoked via
  `/engineering-insights` or automatically when wrapping up.

## The 7 sections (fixed — do not invent new ones)

Every `INSIGHTS.md` has exactly these, in order:

1. **What Works** — approaches/patterns/solutions that proved effective.
2. **What Doesn't Work** — dead ends and antipatterns. ⚠️ Most valuable and most-skipped
   section — a "don't do this" entry saves the next session hours. Do not omit it.
3. **Codebase Patterns** — project conventions, architecture/naming decisions.
4. **Tool & Library Notes** — quirks/gotchas of dependencies.
5. **Recurring Errors & Fixes** — an error seen more than once + its fix.
6. **Session Notes** — datestamped one-liners, newest first: `### YYYY-MM-DD`.
7. **Open Questions** — unresolved things worth investigating.

## Capture procedure

Copy this checklist and check items off as you go:

```
Wrap-up progress:
- [ ] 1. Identify which module(s) the work touched → pick the INSIGHTS.md file(s)
- [ ] 2. READ the whole file first (recall existing entries — never write blind)
- [ ] 3. List candidate insights from this session
- [ ] 4. Drop anything that fails the anti-banality test or duplicates an entry
- [ ] 5. If nothing significant survives → write NOTHING, stop here
- [ ] 6. APPEND survivors to the right section; never overwrite (correct stale
         entries with a new dated note, e.g. "2026-07-09: supersedes above — …")
- [ ] 7. Add one datestamped line to Session Notes summarizing the session
```

## Entry quality — concrete, not banal

**Golden rule:** an entry must be *specific enough that an agent reading it **cold** knows
exactly what to do or avoid without re-investigating.* Good entries are **Specific,
Reusable, Actionable, Dated**. Follow the shape **problem → constraint/workaround**, and
ground it with a `file:line` or symbol where possible.

**Anti-banality test:** *if this would be obvious to anyone who reads the code, don't
write it.*

| ❌ Noise (don't write) | ✅ Insight (write) |
|---|---|
| "Promises can be tricky." | "`Promise.all()` on the ingest pipeline times out past ~30 items — use `Promise.allSettled()` in batches of 10 (`run-executor.ts`)." |
| "Be careful with async." | "Checkout state must go through the shared store, not local state — 3 components read it (`cartStore.ts`)." |
| "Fixed the build." | "`pnpm db:migrate` is NOT run on boot — a fresh DB 500s until you run it manually (server/CLAUDE.md)." |

**Meta-rules for wording:** lead with the *why*, use NEVER/ALWAYS for hard directives,
bullets over paragraphs, include the real command/path. One point per entry.

## Significance gate

Append **only** on a real problem, decision, or discovery. *Only add if genuinely useful
for future sessions.* If this session learned nothing that beats what's already in the
file, **add nothing** — silence is correct. Skip trivial fixes (typos, renames,
one-liners).

## Maintenance

- **Append-only.** Never rewrite history; supersede with a dated note.
- Each `INSIGHTS.md` is a **draft under spot-check**, not gospel — an LLM can misread a
  session; a human corrects the ~10%.
- Keep it lean: soft cap ~30 entries/file. When adding past that, prune first — delete
  entries for deleted/refactored code, merge duplicates, retire resolved Open Questions.
- Commit `INSIGHTS.md` to version control so knowledge is shared and revertible.

See `references.md` for sources and more good/bad examples.

> **Note:** this skill relies on the CLAUDE.md Session Protocol to fire the read/write.
> A manual trigger is imperfect; a later lesson adds a **Stop hook** to make capture
> automatic and reliable.
