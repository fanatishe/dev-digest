# INSIGHTS — server (`@devdigest/api`)

Append-only engineering insights for this module. Read before you write; add only
significant, non-obvious learnings. See `../.claude/skills/engineering-insights/SKILL.md`
for the rubric.

## What Works
<!-- Approaches, patterns, and solutions that proved effective. problem → what to do. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — don't skip it. -->

## Codebase Patterns
<!-- Project conventions, architecture and naming decisions specific to this module. -->

- **`reviewer-core` already returns more than `run-executor` persists.** The review
  `outcome` carries `costUsd` (real OpenRouter `usage.cost`, with an estimate
  fallback) but `run-executor.ts` long destructured only `{ tokensIn, tokensOut,
  grounding }` and dropped it. Before adding new plumbing for a run metric, check
  whether `outcome` already computes it — the gap is usually persistence, not compute.
- **Adding a required field to a shared Zod contract breaks fixtures.** Making
  `RunStats.cost_usd` non-null failed `test/contracts.test.ts` (and client fixtures).
  After a contract change, grep tests for object literals that build it. (2026-07-09)

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies/tooling. -->

## Recurring Errors & Fixes
<!-- An error seen more than once + its fix. -->

## Session Notes
<!-- Datestamped one-liners, newest first: ### YYYY-MM-DD -->

## Open Questions
<!-- Unresolved things worth investigating. -->
