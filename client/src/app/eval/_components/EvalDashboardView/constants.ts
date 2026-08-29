/* EvalDashboardView/constants.ts — colocated copy (see app/eval/constants.ts). */

export const COPY = {
  crumbLab: "Skills Lab",
  crumb: "Eval Dashboard",
  title: "Eval Dashboard",
  subtitle: "Regression signal per agent — reproduction rate, recall, precision and citation from the mechanical scorer.",
  runAll: "Run all agents",
  runAllHint: "Live runs require a provider API key.",
  loadError: "Could not load the eval dashboard.",
  emptyTitle: "No agent evals yet",
  emptyBody: "Turn a review finding into an eval case, then run it to populate this dashboard.",
  recentRuns: "Recent runs",
  agentsLabel: "Agents",
  rowLabel: (name: string): string => `Open eval detail for ${name}`,
  lastRun: (version: string): string => `Last run ${version}`,
  metrics: {
    recall: "Recall",
    precision: "Precision",
    citation: "Citation",
  },
} as const;
