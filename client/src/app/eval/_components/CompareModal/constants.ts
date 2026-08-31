/* CompareModal/constants.ts — colocated copy (see app/eval/constants.ts). */

export const COPY = {
  title: "Compare runs",
  subtitle: "Metric deltas and the system-prompt diff of the two selected versions.",
  deltasLabel: "Metric deltas",
  passRate: "Pass rate",
  close: "Close",
  loadError: "Could not load the comparison.",
  promoteFailed: "Promote failed — try again.",
  promoteUnavailable: "This run has no pinned version to promote.",
  comparing: (base: string, head: string): string => `${base} → ${head}`,
  promote: (version: string): string => `Promote ${version}`,
} as const;
