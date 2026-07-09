# Engineering Insights — references

## Contents
- Sources (browsed)
- Vague vs. useful entries
- One-line entry examples
- INSIGHTS.md vs CLAUDE.md vs chat replay
- Common mistakes

## Sources (browsed)

Core loop & format:
- MindStudio — *Self-Learning AI Skill System with Learnings.md + Wrap-Up Skill*
  https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up
- MindStudio — *How to Build a Learnings Loop for Claude Code Skills*
  https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills
- MindStudio — *Compounding Knowledge Loop in Claude Code* (hooks; Stop = capture point)
  https://www.mindstudio.ai/blog/compounding-knowledge-loop-claude-code

Skill authoring:
- Anthropic — *Skill authoring best practices*
  https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Anthropic — *Lessons from building Claude Code: How we use skills*
  https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills

Persistent-memory practice:
- dev.to/evoleinik — *CLAUDE.md: Building Persistent Memory for AI Coding Agents*
  https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322
- dev.to/aviad — *Self-Improving AI: One Prompt That Makes Claude Learn From Every Mistake*
  https://dev.to/aviad_rozenhek_cba37e0660/self-improving-ai-one-prompt-that-makes-claude-learn-from-every-mistake-16ek

Local digest of all of the above: `../../../screenshots/engineering-insights-research.md`.

## Vague vs. useful entries

The single quality bar: *"specific enough that an agent reading it cold knows exactly
what to do or avoid without needing to re-investigate."* (MindStudio)

| ❌ Vague (noise) | ✅ Useful (insight) |
|---|---|
| "Promises can be tricky." | "`Promise.all()` on the ingest pipeline times out past ~30 items — use `Promise.allSettled()` in batches of 10 (`run-executor.ts`)." |
| "Be careful with async." | "Checkout state must go through the shared store, not local state — 3 components read it (`cartStore.ts`)." |
| "Auth was confusing." | "`jwt.decode()` does NOT verify the signature — always `jwt.verify()` in the auth middleware." |

## One-line entry examples

Shape: **problem → constraint/workaround**, dated, grounded.

- "2026-07-09: `pnpm db:migrate` is not run on boot — fresh DB 500s until run manually."
- "2026-07-09: repo-intel is read-only during a review — mutate only via the indexer, never the pipeline internals."
- "2026-07-09: `*.it.test.ts` is the ONLY suffix the DB-backed suite picks up — rename or the split breaks."

## INSIGHTS.md vs CLAUDE.md vs chat replay

- **CLAUDE.md** — stable config: how to run tests, conventions, structure. Doesn't change
  session to session.
- **INSIGHTS.md** — evolving knowledge: discoveries, recurring mistakes, decisions,
  gotchas. Dated so recent entries weigh more.
- **Chat replay** — NOT this. Replaying conversations adds noise without signal; capture
  the extracted insight, not the transcript.

## Common mistakes (avoid)

1. Not capturing consistently — the loop only compounds if it runs.
2. Generic entries — fail the anti-banality test.
3. File bloat — prune; soft cap ~30 entries/file.
4. Conflicting entries — resolve/supersede with a dated note, don't leave contradictions.
5. Skipping **What Doesn't Work** — the most valuable, most-skipped section.
