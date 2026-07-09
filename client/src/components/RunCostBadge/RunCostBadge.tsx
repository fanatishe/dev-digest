import { formatCost } from "@/lib/format-cost";

/**
 * Compact inline USD cost, shared by the PR-list COST column and the agent-runs
 * timeline. Renders "—" (always muted) when no cost was reported, the formatted
 * value otherwise. A present value inherits the caller's text colour so it reads
 * normal in the list and muted in the timeline; only the empty dash is forced
 * muted. Uses tabular figures so column values align.
 */
export function RunCostBadge({ usd }: { usd: number | null | undefined }) {
  const isEmpty = usd == null;
  return (
    <span
      style={{
        fontVariantNumeric: "tabular-nums",
        ...(isEmpty ? { color: "var(--text-muted)" } : {}),
      }}
    >
      {formatCost(usd)}
    </span>
  );
}
