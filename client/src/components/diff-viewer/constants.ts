/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/* The severity → colour token map used to live here (a local copy, because the
   shared ring may not import a route's `_components/`). It now lives in
   `@/lib/severity` — a downward, legal dependency — and is the ONE copy. */
