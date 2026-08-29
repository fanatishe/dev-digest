/* AgentEvalDetailView — per-agent eval detail: metric cards with deltas, a metric
   trend from eval_batches, a date-range filter, and a selectable runs table that
   opens run-vs-run Compare + Promote (spec AC-21, AC-23, AC-24 UI, AC-27, AC-29).

   `?from&to` (ISO, default last 30 days server-side) drives both the dashboard and
   the batches; the chip updates BOTH keys in a single `router.replace` — two writes
   would clobber (client INSIGHTS 2026-07-13). Every state degrades without throwing
   (AC-27). Data flows only through the WP-D hooks. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MetricCard, Button, ErrorState, Skeleton, SectionLabel, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgent } from "@/lib/hooks/agents";
import { useAgentEvalDashboard, useAgentEvalBatches, useRunAll } from "@/lib/hooks/evals";
import { pct } from "../../helpers";
import { METRICS } from "../../constants";
import { DateRangeChip, type DateRange } from "../DateRangeChip";
import { RecentRunsTable } from "../RecentRunsTable";
import { CompareModal } from "../CompareModal";
import { TrendChart } from "./_components/TrendChart";
import { byRanAtAsc, byRanAtDesc, currentMetric, deltaMetric } from "./helpers";
import { COPY } from "./constants";
import { s } from "./styles";

export function AgentEvalDetailView({ agentId }: { agentId: string }) {
  const search = useSearchParams();
  const router = useRouter();
  const from = search?.get("from") ?? undefined;
  const to = search?.get("to") ?? undefined;
  const range: DateRange = { from, to };

  const agent = useAgent(agentId);
  const dashboard = useAgentEvalDashboard(agentId, range);
  const batches = useAgentEvalBatches(agentId, range);
  const runAll = useRunAll(agentId);

  const [compare, setCompare] = React.useState<{ base: string; head: string } | null>(null);

  // One replace, BOTH keys — never two setParam calls (client INSIGHTS 2026-07-13).
  const setRange = (next: DateRange) => {
    const sp = new URLSearchParams(search?.toString() ?? "");
    if (next.from) sp.set("from", next.from);
    else sp.delete("from");
    if (next.to) sp.set("to", next.to);
    else sp.delete("to");
    const q = sp.toString();
    router.replace(`/eval/${agentId}${q ? `?${q}` : ""}`);
  };

  const allBatches = batches.data ?? [];
  const asc = React.useMemo(() => byRanAtAsc(allBatches), [allBatches]);
  const desc = React.useMemo(() => byRanAtDesc(allBatches), [allBatches]);
  const current = dashboard.data?.current;
  const delta = dashboard.data?.delta;

  return (
    <AppShell crumb={[{ label: COPY.crumbLab }, { label: COPY.crumbDashboard, href: "/eval" }, { label: agent.data?.name ?? COPY.crumbAgent }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <Link href="/eval" style={s.back}>
              <Icon.ChevronLeft size={13} /> {COPY.back}
            </Link>
            <h1 style={s.h1}>{agent.data?.name ?? COPY.fallbackName}</h1>
            <p style={s.subtitle}>{COPY.subtitle}</p>
          </div>
          <DateRangeChip from={from} onChange={setRange} />
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            loading={runAll.isPending}
            onClick={() => runAll.mutate(undefined)}
          >
            {COPY.runAll}
          </Button>
        </div>

        {/* Live run-all degrades to a non-throwing inline notice with no key (AC-27). */}
        {runAll.isError && <div style={s.runError}>{COPY.runError}</div>}

        {dashboard.isError || batches.isError ? (
          <ErrorState body={COPY.loadError} onRetry={() => { dashboard.refetch(); batches.refetch(); }} />
        ) : (
          <>
            <div style={s.cards}>
              {METRICS.map((m) => (
                <MetricCard
                  key={m.key}
                  label={m.label}
                  value={current ? pct(currentMetric(current, m.key)) : "—"}
                  delta={delta ? deltaMetric(delta, m.key) : undefined}
                  color={m.color}
                  trend={asc.map((b) =>
                    m.key === "recall" ? b.recall : m.key === "precision" ? b.precision : b.citation_accuracy,
                  )}
                />
              ))}
            </div>

            <section style={s.section}>
              <SectionLabel icon="TrendingUp">{COPY.trend}</SectionLabel>
              {batches.isLoading ? (
                <Skeleton height={220} />
              ) : asc.length === 0 ? (
                <div style={s.note}>{COPY.noTrend}</div>
              ) : (
                <TrendChart batches={asc} />
              )}
            </section>

            <section style={s.section}>
              <SectionLabel icon="History">{COPY.recentRuns}</SectionLabel>
              {batches.isLoading ? (
                <Skeleton height={160} />
              ) : (
                <RecentRunsTable
                  batches={desc}
                  onCompare={(base, head) => setCompare({ base, head })}
                />
              )}
            </section>
          </>
        )}
      </div>

      {compare && (
        <CompareModal
          agentId={agentId}
          base={compare.base}
          head={compare.head}
          onClose={() => setCompare(null)}
        />
      )}
    </AppShell>
  );
}

export default AgentEvalDetailView;
