import type { Severity } from "@devdigest/ui";

/**
 * Apply a MULTI-KEY patch to the current query string in ONE pass.
 *
 * This exists because writing two params with two sequential single-key calls is
 * a real bug: each call rebuilds the query from the `search` snapshot it closed
 * over, so the second read is stale and CLOBBERS the first. The finding badge in
 * the diff must set `tab` AND `finding` together, so both must go into a single
 * `URLSearchParams` and a single `router.replace`.
 *
 * A `null` value deletes the key. Returns the leading "?" (or "" when empty), so
 * the caller can append it to a path directly.
 */
export function mergeParams(current: string, patch: Record<string, string | null>): string {
  const sp = new URLSearchParams(current);
  for (const [key, val] of Object.entries(patch)) {
    if (val == null) sp.delete(key);
    else sp.set(key, val);
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

/** The finding severities that the `?severity=` filter may select. */
const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/**
 * Validate the raw `?severity=` query value against the known set. The param is
 * attacker-controlled and an unknown value would silently hide every finding
 * (nothing matches), so anything off-list becomes `null` (no filter).
 */
export function parseSeverity(param: string | null): Severity | null {
  return SEVERITIES.includes(param as never) ? (param as Severity) : null;
}
