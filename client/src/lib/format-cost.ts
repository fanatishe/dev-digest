/**
 * Format a run's USD cost for display.
 *
 * Single source of the "no data → em-dash, never $0.00" rule: a null/undefined
 * cost (run reported no usage) renders as "—", while a genuine 0 renders "$0.00".
 * Precision adapts to sub-cent runs — enough digits to be meaningful, trailing
 * zeros trimmed, but never fewer than 2 decimals (e.g. 0.0013 → "$0.0013",
 * 0.06 → "$0.06", 0.014 → "$0.014", 0.2 → "$0.20").
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return "—";
  const trimmed = usd.toFixed(4).replace(/0+$/, "");
  const [int, dec = ""] = trimmed.split(".");
  return `$${int}.${dec.padEnd(2, "0")}`;
}
