# INSIGHTS — client (`@devdigest/web`)

Append-only engineering insights for this module. Read before you write; add only
significant, non-obvious learnings. See `../.claude/skills/engineering-insights/SKILL.md`
for the rubric.

## What Works
<!-- Approaches, patterns, and solutions that proved effective. problem → what to do. -->

- **Hover popover = JS state + popup rendered as a DOM descendant of the anchor.**
  `vendor/ui/primitives/FindingsPopover.tsx` is the module's first real popover
  (everything else used native `title`). Keep the popup element a *child* of the
  wrapper that owns `onMouseEnter/Leave`, so moving the pointer onto the popup does
  NOT fire `mouseleave` (descendants count as "inside" the wrapper); add a ~120ms
  close delay to cover the anchor→popup gap, plus `onFocus/onBlur` for a11y. CSS-only
  `:hover` can't survive pointer travel or drive click-to-filter state. (2026-07-09)

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

- **The UI `Severity` type (`vendor/ui/tokens.ts`) is wider than the contract one.**
  It adds `INFO`, so indexing a 3-key `{CRITICAL,WARNING,SUGGESTION}` counts object
  by a `Severity` from `@devdigest/ui` fails typecheck (`Property 'INFO' does not
  exist`). Narrow the iteration keys with `as const` (e.g.
  `["CRITICAL","WARNING","SUGGESTION"] as const`) rather than typing them `Severity[]`.
  Contract-side `Severity` (`vendor/shared/contracts/findings.ts`) is the 3-value enum. (2026-07-09)

## Recurring Errors & Fixes
<!-- An error seen more than once + its fix. -->

## Session Notes
<!-- Datestamped one-liners, newest first: ### YYYY-MM-DD -->

### 2026-07-09
Added findings-severity counters + hover popover + `?severity=` filter to the PR list
and agent-runs timeline. New `FindingsPopover` primitive and shared
`components/FindingsSeverityCounts`; timeline counts derived client-side via
`RunHistory/helpers.ts` (`findingsByRun`), list counts from the server rollup.

## Open Questions
<!-- Unresolved things worth investigating. -->
