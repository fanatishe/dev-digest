/* DateRangeChip/constants.ts — colocated copy.

   Route-scoped copy is held here rather than in a next-intl namespace: WP-G owns
   no writable eval message file (`messages/en/eval.json` belongs to WP-E and lacks
   these labels), and reading an absent key from a PRESENT namespace throws at
   runtime (client INSIGHTS 2026-07-17) — which would violate AC-27's "never throw".
   A follow-up that allocates WP-G an eval-dashboard namespace can lift these. */

export const COPY = {
  ariaLabel: "Date range",
  preset: (days: number): string => `Last ${days} days`,
} as const;
