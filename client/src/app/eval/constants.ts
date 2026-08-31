/* app/eval/constants.ts — route-level constants shared across the eval surface.

   Copy is colocated here (not next-intl): WP-G owns no writable eval message file
   (`messages/en/eval.json` is WP-E's and lacks these labels), and reading an absent
   key from a present namespace throws (client INSIGHTS 2026-07-17), which would
   violate AC-27's "never throw". A follow-up can lift these into a namespace. */

/** The three eval metrics, in display order, with their trend colours. */
export const METRICS = [
  { key: "recall", label: "Recall", color: "var(--accent)" },
  { key: "precision", label: "Precision", color: "var(--ok)" },
  { key: "citation", label: "Citation", color: "var(--info)" },
] as const;

export type MetricKey = (typeof METRICS)[number]["key"];
