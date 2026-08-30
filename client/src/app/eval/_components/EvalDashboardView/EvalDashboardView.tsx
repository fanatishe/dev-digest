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
  Button,
  EmptyState,
  ErrorState,
  Icon,
  SectionLabel,
  Skeleton,
  Sparkline,
} from "@devdigest/ui";
import type { EvalBatch, EvalDashboardRow } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useEvalDashboard, useDashboardRunAll } from "@/lib/hooks/evals";
import { useSecretsStatus } from "@/lib/hooks/core";
import { pct, passSummary, versionLabel, shortWhen } from "../../helpers";
import { METRICS } from "../../constants";
import { MetricBar } from "../MetricBar";
import { COPY } from "./constants";
import { s } from "./styles";

/** One row in the "recent eval runs · all agents" list: agent name + the batch's
    three colored metric bars + pass count (matches the per-agent detail table). */
function RecentRunRow({ name, batch }: { name: string; batch: EvalBatch }) {
  return (
    <div style={s.recentRow}>
      <span style={s.recentName}>{name}</span>
      <span style={s.recentWhen}>{shortWhen(batch.ran_at)}</span>
      <Badge mono bg="transparent" style={s.recentVersion}>
        {versionLabel(batch.agent_version)}
      </Badge>
      <MetricBar value={batch.recall} color={METRICS[0].color} title={`${COPY.metrics.recall} ${batch.recall}`} />
      <MetricBar value={batch.precision} color={METRICS[1].color} title={`${COPY.metrics.precision} ${batch.precision}`} />
      <MetricBar value={batch.citation_accuracy} color={METRICS[2].color} title={`${COPY.metrics.citation} ${batch.citation_accuracy}`} />
      <span style={s.recentPass} title={passSummary(batch)}>
        {batch.traces_passed}/{batch.traces_total}
      </span>
    </div>
  );
}

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
  const secrets = useSecretsStatus();
  const runAll = useDashboardRunAll();
  const hasKey = secrets.data?.openrouter ?? false;

  // Recent batches carry only owner_id; resolve the agent name from the rows.
  const nameByOwner = React.useMemo(
    () => new Map((data?.agents ?? []).map((a) => [a.owner_id, a.name])),
    [data?.agents],
  );

  return (
    <AppShell crumb={[{ label: COPY.crumbLab }, { label: COPY.crumb }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{COPY.title}</h1>
            <p style={s.subtitle}>{COPY.subtitle}</p>
          </div>
          {/* Live "Run all agents" runs each agent-with-cases once. Gated on a
              provider key: without one it stays disabled with a hint; with one a
              failed live run degrades to a non-throwing notice (AC-27). */}
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            loading={runAll.isPending}
            disabled={!hasKey || runAll.isPending}
            title={hasKey ? undefined : COPY.runAllHint}
            onClick={() => runAll.mutate()}
          >
            {COPY.runAll}
          </Button>
        </div>

        {/* Live run-all degrades to a non-throwing inline notice on failure (AC-27). */}
        {runAll.isError && <div style={s.runError}>{COPY.runError}</div>}

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
                    <RecentRunRow
                      key={batch.id}
                      name={nameByOwner.get(batch.owner_id) ?? versionLabel(batch.agent_version)}
                      batch={batch}
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
