/* RecentRunsTable/constants.ts — colocated copy (see app/eval/constants.ts for why
   route copy is not in a next-intl namespace for WP-G). */

export const COPY = {
  compare: "Compare",
  compareHint: "Select exactly two runs to compare",
  noRuns: "No runs in this range yet.",
  selectedCount: (n: number): string => `${n} selected`,
  selectLabel: (version: string, when: string): string =>
    `Select run ${version} from ${when}`,
  col: {
    ranAt: "Ran at",
    version: "Version",
    recall: "Recall",
    precision: "Precision",
    citation: "Citation",
    pass: "Pass",
    cost: "Cost",
  },
} as const;
