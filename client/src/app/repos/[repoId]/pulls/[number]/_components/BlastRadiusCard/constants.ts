import type { DegradedReasonKey, BlastView } from "./helpers";

/** The two ways to read the same data. Tree is the default: it is scannable and exact. */
export const VIEWS = ["tree", "graph"] as const satisfies readonly BlastView[];

/**
 * `reason` arrives from the server as a free `string` (the contract types it loosely so
 * new reasons don't break the client). We map only the ones we have copy for, and fall
 * back to a generic message — an unrecognized reason must still explain itself, never
 * render a raw enum token like `index_partial` at the user.
 */
export const KNOWN_DEGRADED_REASONS = [
  "no_data",
  "flag_off",
  "index_partial",
  "index_failed",
  "repo_too_large",
] as const satisfies readonly DegradedReasonKey[];

// ---- Graph layout ---------------------------------------------------------------
// A hand-rolled 3-column SVG, not a graph library. The shape is always the same —
// changed symbol → callers → endpoints — so a layout engine would be 40KB of
// dependency to reproduce three `x` coordinates.

export const GRAPH = {
  width: 560,
  nodeHeight: 26,
  rowGap: 12,
  /** x of each column's LEFT edge: symbols · callers · endpoints. */
  columnX: [8, 200, 392] as const,
  columnWidth: 160,
  paddingY: 12,
  /** Beyond this, the graph stops being readable — the tree view is the answer. */
  maxCallersPerSymbol: 6,
  maxEndpoints: 6,
} as const;
