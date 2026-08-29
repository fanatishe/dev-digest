/* EvalDashboardView — the agents-only Eval Dashboard landing (spec AC-20, AC-21).

   Lists every AGENT's latest eval batch (model chip, last-run pass count, sparkline,
   recall/precision/citation) and a recent-batches bar list. It NEVER lists skills —
   the `EvalAgentDashboard` contract carries only agents, so this is agents-only by
   construction (AC-20). Every state (loading / error / empty / no key) renders a
   non-throwing affordance (AC-27). Data comes solely from `useEvalDashboard`. */
"use client";

import React from "react";
import Link from "next/link";
import {
  Badge,
  BarRow,
  Button,
  EmptyState,
  ErrorState,
  Icon,
  SectionLabel,
  Skeleton,
  Sparkline,
} from "@devdigest/ui";
import type { EvalDashboardRow } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard } from "@/lib/hooks/evals";
import { pct, passSummary, versionLabel, shortWhen } from "../../helpers";
import { COPY } from "./constants";
import { s } from "./styles";

function AgentRow({ row }: { row: EvalDashboardRow }) {
  const b = row.last_batch;
  return (
    <Link href={`/eval/${row.owner_id}`} style={s.row} aria-label={COPY.rowLabel(row.name)}>
      <div style={s.rowMain}>
        <span style={s.rowName}>{row.name}</span>
        {row.model && (
          <Badge icon="Cpu" bg="transparent" style={s.modelChip}>
            {row.model}
          </Badge>
        )}
        <span style={s.lastRun}>
          {COPY.lastRun(versionLabel(row.agent_version))} · {passSummary(b)}
        </span>
      </div>
      <div style={s.rowMetrics}>
        <Sparkline data={row.sparkline} w={90} h={26} />
        <span style={s.metric}>
          <span style={s.metricLabel}>{COPY.metrics.recall}</span>
          {pct(b?.recall)}
        </span>
        <span style={s.metric}>
          <span style={s.metricLabel}>{COPY.metrics.precision}</span>
          {pct(b?.precision)}
        </span>
        <span style={s.metric}>
          <span style={s.metricLabel}>{COPY.metrics.citation}</span>
          {pct(b?.citation_accuracy)}
        </span>
      </div>
    </Link>
  );
}

export function EvalDashboardView() {
  const { data, isLoading, isError, refetch } = useEvalDashboard();

  return (
    <AppShell crumb={[{ label: COPY.crumbLab }, { label: COPY.crumb }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{COPY.title}</h1>
            <p style={s.subtitle}>{COPY.subtitle}</p>
          </div>
          {/* Live "Run all agents" needs a provider key + a dashboard run-all hook
              (not exported by WP-D); it degrades to a disabled affordance so the
              seeded demo path never triggers a live call (AC-27). */}
          <Button kind="secondary" size="sm" icon="Play" disabled title={COPY.runAllHint}>
            {COPY.runAll}
          </Button>
        </div>

        {isLoading && (
          <div style={s.list}>
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        )}

        {isError && <ErrorState body={COPY.loadError} onRetry={() => refetch()} />}

        {data && data.agents.length === 0 && (
          <EmptyState icon="FlaskConical" title={COPY.emptyTitle} body={COPY.emptyBody} />
        )}

        {data && data.agents.length > 0 && (
          <>
            <div style={s.list} role="list" aria-label={COPY.agentsLabel}>
              {data.agents.map((row) => (
                <div role="listitem" key={row.owner_id}>
                  <AgentRow row={row} />
                </div>
              ))}
            </div>

            {data.recent_batches.length > 0 && (
              <section style={s.recent}>
                <SectionLabel icon="History">{COPY.recentRuns}</SectionLabel>
                <div style={s.recentList}>
                  {data.recent_batches.map((batch) => (
                    <BarRow
                      key={batch.id}
                      label={`${versionLabel(batch.agent_version)} · ${shortWhen(batch.ran_at)}`}
                      value={batch.pass_rate}
                      max={1}
                      suffix={pct(batch.pass_rate)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

export default EvalDashboardView;
