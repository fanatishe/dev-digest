import type { Metadata } from "next";
import { EvalDashboardView } from "./_components/EvalDashboardView";

/* Route: /eval — the agents-only Eval Dashboard (spec AC-20/AC-21). Thin Server
   Component: it owns metadata and renders the colocated "use client" view. The
   dashboard data, rows, recent-runs list and copy live under _components. */
export const metadata: Metadata = { title: "Eval Dashboard" };

export default function EvalDashboardPage() {
  return <EvalDashboardView />;
}
