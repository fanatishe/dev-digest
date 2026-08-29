/* TrendChart — the multi-series metric trend built from a range of eval batches.

   Recharts is demo-fragile (react-best-practices note for WP-G): a resize/render
   quirk should never blank the page, so the LineChart is wrapped in a local error
   boundary that falls back to three plain inline Sparklines (no Recharts). Both
   render the same recall/precision/citation series in chronological order. */
"use client";

import React from "react";
import { LineChart, Sparkline, type ChartSeries } from "@devdigest/ui";
import type { EvalBatch } from "@devdigest/shared";
import { METRICS } from "@/app/eval/constants";
import { s } from "./styles";

class ChartBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function TrendChart({ batches }: { batches: EvalBatch[] }) {
  const series: ChartSeries[] = React.useMemo(
    () =>
      METRICS.map((m) => ({
        name: m.label,
        color: m.color,
        data: batches.map((b) =>
          m.key === "recall" ? b.recall : m.key === "precision" ? b.precision : b.citation_accuracy,
        ),
      })),
    [batches],
  );

  const legend = (
    <div style={s.legend}>
      {METRICS.map((m) => (
        <span key={m.key} style={s.legendItem}>
          <span style={{ ...s.legendDot, background: m.color }} />
          {m.label}
        </span>
      ))}
    </div>
  );

  const fallback = (
    <div style={s.fallback}>
      {series.map((sr) => (
        <div key={sr.name} style={s.fallbackRow}>
          <span style={s.fallbackLabel}>{sr.name}</span>
          <Sparkline data={sr.data} color={sr.color} w={420} h={40} />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      {legend}
      <ChartBoundary fallback={fallback}>
        <LineChart series={series} h={220} />
      </ChartBoundary>
    </div>
  );
}

export default TrendChart;
