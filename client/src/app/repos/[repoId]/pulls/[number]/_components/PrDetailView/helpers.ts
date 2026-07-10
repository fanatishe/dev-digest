import type { Severity } from "@devdigest/ui";

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
