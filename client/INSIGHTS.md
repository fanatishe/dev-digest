# INSIGHTS — client (`@devdigest/web`)

Append-only engineering insights for this module. Read before you write; add only
significant, non-obvious learnings. See `../.claude/skills/engineering-insights/SKILL.md`
for the rubric.

## What Works
<!-- Approaches, patterns, and solutions that proved effective. problem → what to do. -->

## What Doesn't Work
<!-- Dead ends and antipatterns. The most valuable section — don't skip it. -->

## Codebase Patterns
<!-- Project conventions, architecture and naming decisions specific to this module. -->

- **A PR-list column spans four coordinated edits.** The table is CSS-grid driven:
  add the track to `GRID` and the key to `COLUMN_KEYS` (`pulls/constants.ts`), render
  the cell in `PRRow.tsx`, and add the `list.columns.<key>` string in
  `messages/en/prReview.json`. Miss one and the header/rows misalign silently.
- **Reusable inline badges should inherit colour, not set it.** `RunCostBadge` renders
  normal in the PR list but muted in the timeline by leaving `color` unset for a
  present value (inherits the cell) and forcing `--text-muted` only on the empty dash.
  Hard-coding `--text` made it clash with the muted timeline row. (2026-07-09)

## Tool & Library Notes
<!-- Quirks and gotchas of dependencies/tooling. -->

## Recurring Errors & Fixes
<!-- An error seen more than once + its fix. -->

## Session Notes
<!-- Datestamped one-liners, newest first: ### YYYY-MM-DD -->

## Open Questions
<!-- Unresolved things worth investigating. -->
