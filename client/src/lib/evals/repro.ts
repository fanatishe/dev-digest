/* lib/evals/repro.ts — pure reproduction-rate derivation for eval cases (AC-14).

   No I/O, no React: given the last N runs of a case (as the runs endpoint returns
   them), compute how reliably the pinned agent version reproduces the outcome. */

import type { EvalRunRecord, EvalReproducibility } from "@devdigest/shared";

/** A case reproduces reliably iff its pass ratio is >= 0.8 (spec AC-14). */
export const REPRO_RELIABLE_THRESHOLD = 0.8;

/** Default reproduction window: the last 5 runs (spec AC-13/AC-14, N = 5). */
export const REPRO_DEFAULT_WINDOW = 5;

/**
 * Reproduction rate over the last `window` runs of a case (AC-14).
 *
 * `runs` is expected newest-first, as `GET /eval/cases/:id/runs?limit=N` returns
 * them; only the first `window` are counted, so a caller can pass a longer history
 * and still measure the last N. A run counts as reproduced when `pass === true`
 * (a not-yet-scored run has `pass: null` and does not count as passed). The window
 * is measured against the runs supplied — the server already restricts them to the
 * pinned `agent_version` (AC-15), so this stays a pure count.
 *
 * Empty input → `ratio` 0 and `reliable` false (never divides by zero).
 */
export function reproRate(
  runs: readonly EvalRunRecord[],
  window: number = REPRO_DEFAULT_WINDOW,
): EvalReproducibility {
  const recent = runs.slice(0, Math.max(0, window));
  const total = recent.length;
  const passed = recent.filter((run) => run.pass === true).length;
  const ratio = total === 0 ? 0 : passed / total;
  return { passed, total, ratio, reliable: ratio >= REPRO_RELIABLE_THRESHOLD };
}
