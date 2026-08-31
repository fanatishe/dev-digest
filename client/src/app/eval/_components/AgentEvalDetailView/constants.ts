/* AgentEvalDetailView/constants.ts — colocated copy (see app/eval/constants.ts). */

export const COPY = {
  crumbLab: "Skills Lab",
  crumbDashboard: "Eval Dashboard",
  crumbAgent: "Agent",
  back: "Eval Dashboard",
  fallbackName: "Agent evals",
  subtitle: "Metric trend, run history, and run-vs-run compare for this agent's eval cases.",
  runAll: "Run all",
  runAllHint: "Add an OpenRouter key in Settings → Secrets to run live.",
  runError: "Live run failed — showing the seeded batches instead.",
  loadError: "Could not load this agent's eval detail.",
  trend: "Metric trend",
  noTrend: "No batches in this range yet — widen the date range or run the cases.",
  recentRuns: "Recent runs",
} as const;
