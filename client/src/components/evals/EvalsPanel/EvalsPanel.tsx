/* EvalsPanel — the shared, owner-agnostic eval surface rendered by BOTH the
   AgentEditor and SkillEditor Evals tabs, parameterized by owner={kind,id}. There
   is ONE panel, not two copies (frontend-ui-architecture; spec AC-18).

   - Metric cards (recall / precision / citation / traces-passed) DERIVED from the
     owner's cases' last runs (owner-agnostic — works for a skill, which has no
     per-owner dashboard endpoint). Derived during render, never stored.
   - A "scoring is mechanical — no model call" caption (the zero-LLM invariant).
   - `EvalCasesList` of `EvalCaseRow`s; "New eval case" opens WP-E's EvalCaseModal
     in blank create-mode (no finding seed).
   - Agent-only affordances: "Run all evals" (useRunAll) and a "View full dashboard"
     link — gated on owner.kind === "agent" and `showDashboardLink` (the dashboard
     lists no skills).
   - Every state (loading / error / zero-case / no-key run failure) renders and
     never throws (security / AC-27). All data flows through WP-D hooks; content is
     rendered as text, never dangerouslySetInnerHTML.

   i18n: this panel reads the `agents` namespace (`evalsPanel.*`); the imported
   badges/modal read the `eval` namespace. Tests must provide BOTH — next-intl
   throws on a missing key within a present namespace (client INSIGHTS 2026-07-17). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, MetricCard, SectionLabel, Skeleton } from "@devdigest/ui";
import type { EvalCaseWithRuns, EvalOwnerKind } from "@devdigest/shared";
import { useBatchFromLatest, useEvalCases, useRunCase } from "@/lib/hooks/evals";
import { EvalCaseModal } from "@/components/evals/EvalCaseModal";
import { EvalCasesList } from "@/components/evals/EvalCasesList";
import { deriveMetrics, pct } from "./helpers";
import { s } from "./styles";

export interface EvalsPanelProps {
  /** The owner this panel scopes to — an agent or a skill (spec AC-18). */
  owner: { kind: EvalOwnerKind; id: string };
  /** Whether cases here may be finding-derived (agent) — false for standalone skill cases. */
  allowFromFinding?: boolean;
  /** Show the "View full dashboard" link (agents-only; the dashboard lists no skills). */
  showDashboardLink?: boolean;
}

export function EvalsPanel({
  owner,
  allowFromFinding = true,
  showDashboardLink = false,
}: EvalsPanelProps) {
  const t = useTranslations("agents");
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<EvalCaseWithRuns | null>(null);

  const cases = useEvalCases(owner);

  const rows = React.useMemo(() => cases.data ?? [], [cases.data]);
  const metrics = React.useMemo(() => deriveMetrics(rows), [rows]);
  const isAgent = owner.kind === "agent";

  // "Run all evals" runs every case once, one after another — VISUALLY, as if each row's own
  // Run button were clicked (the running row shows its spinner, each run invalidates the cases
  // query so its pass updates before the next starts). Then it rolls those just-run cases into
  // ONE dashboard batch ("All (N)") via batch-from-latest — so the run is both a live cascade
  // AND a dashboard trend point. Sequential, not parallel, so the cascade is legible. A single
  // case's failure never aborts the sweep.
  const run = useRunCase();
  const batchFromLatest = useBatchFromLatest(owner.kind === "agent" ? owner : null);
  const [runningId, setRunningId] = React.useState<string | null>(null);
  const [runAllError, setRunAllError] = React.useState(false);
  const runningAll = runningId !== null;

  async function runAllEvals() {
    setRunAllError(false);
    const ran: string[] = [];
    for (const c of rows) {
      setRunningId(c.id);
      try {
        await run.mutateAsync({ caseId: c.id, times: 1 });
        ran.push(c.id);
      } catch {
        setRunAllError(true); // e.g. no provider key — surfaced inline, never thrown (AC-27)
      }
    }
    // Roll the just-run cases into one dashboard trend point (only for agents — the dashboard
    // lists no skills). Failure here is non-fatal: the per-row results already landed.
    if (ran.length > 0 && owner.kind === "agent") {
      await batchFromLatest.mutateAsync(ran).catch(() => setRunAllError(true));
    }
    setRunningId(null);
  }

  const cards = [
    { key: "recall", label: t("evalsPanel.metrics.recall"), value: pct(metrics.recall) },
    { key: "precision", label: t("evalsPanel.metrics.precision"), value: pct(metrics.precision) },
    { key: "citation", label: t("evalsPanel.metrics.citation"), value: pct(metrics.citation) },
    {
      key: "traces",
      label: t("evalsPanel.metrics.tracesPassed"),
      value: `${metrics.tracesPassed}/${metrics.tracesTotal}`,
    },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.metricsHead}>
        <div style={s.cards}>
          {cards.map((c) => (
            <MetricCard key={c.key} label={c.label} value={c.value} />
          ))}
        </div>
        <p style={s.caption}>{t("evalsPanel.scoringCaption")}</p>
      </div>

      <SectionLabel
        icon="FlaskConical"
        right={
          <div style={s.actions}>
            {isAgent && (
              <Button
                kind="secondary"
                size="sm"
                icon="Play"
                loading={runningAll}
                disabled={runningAll || rows.length === 0}
                onClick={runAllEvals}
              >
                {t("evalsPanel.runAll")}
              </Button>
            )}
            <Button kind="primary" size="sm" icon="Plus" onClick={() => setCreating(true)}>
              {t("evalsPanel.newCase")}
            </Button>
          </div>
        }
      >
        {t("editor.tabs.evals")}
      </SectionLabel>

      {isAgent && runAllError && <div style={s.runError}>{t("evalsPanel.runError")}</div>}

      {cases.isLoading ? (
        <div style={s.loading}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : cases.isError ? (
        <div style={s.runError} role="alert">
          {t("evalsPanel.loadError")}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="FlaskConical"
          title={t("evalsPanel.emptyTitle")}
          body={allowFromFinding ? t("evalsPanel.emptyBodyAgent") : t("evalsPanel.emptyBodySkill")}
          cta={t("evalsPanel.newCase")}
          onCta={() => setCreating(true)}
        />
      ) : (
        <EvalCasesList cases={rows} onEdit={setEditing} runningId={runningId} />
      )}

      {showDashboardLink && isAgent && (
        <div style={s.dashboardLink}>
          <Link href={`/eval/${owner.id}`} style={s.link}>
            {t("evalsPanel.viewDashboard")}
          </Link>
        </div>
      )}

      {creating && <EvalCaseModal owner={owner} onClose={() => setCreating(false)} />}
      {editing && (
        <EvalCaseModal
          owner={owner}
          existingCase={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default EvalsPanel;
