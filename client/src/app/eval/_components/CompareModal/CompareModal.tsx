/* CompareModal — run-vs-run comparison of two selected batches (spec AC-23, AC-24 UI).

   Loads the compare via `useEvalCompare` (base/head batch ids), shows metric deltas
   and the system-prompt diff, and offers Promote — which pushes the head version's
   config to the agent through `usePromoteVersion` (→ agents repo, the single
   version-snapshot path). Every state (loading / error / missing prompt / promote
   failure) degrades to a non-throwing affordance so the demo never crashes (AC-27). */
"use client";

import React from "react";
import { Modal, Button, Skeleton } from "@devdigest/ui";
import { useEvalCompare, usePromoteVersion } from "@/lib/hooks/evals";
import { pct, deltaPts, versionLabel } from "../../helpers";
import { METRICS } from "../../constants";
import { PromptDiffPanel } from "../PromptDiffPanel";
import { COPY } from "./constants";
import { s } from "./styles";

function deltaColor(n: number): string {
  return n > 0 ? "var(--ok)" : n < 0 ? "var(--crit)" : "var(--text-muted)";
}

/** Read a metric off a batch by the display key (maps "citation" → citation_accuracy). */
function batchMetric(
  b: { recall: number; precision: number; citation_accuracy: number },
  key: "recall" | "precision" | "citation",
): number {
  return key === "recall" ? b.recall : key === "precision" ? b.precision : b.citation_accuracy;
}

function deltaMetric(
  d: { recall: number; precision: number; citation_accuracy: number },
  key: "recall" | "precision" | "citation",
): number {
  return key === "recall" ? d.recall : key === "precision" ? d.precision : d.citation_accuracy;
}

export function CompareModal({
  agentId,
  base,
  head,
  onClose,
}: {
  agentId: string;
  base: string;
  head: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useEvalCompare(base, head);
  const promote = usePromoteVersion();

  const headVersion = data?.head.agent_version ?? null;
  const canPromote = headVersion != null && !promote.isPending;

  const doPromote = () => {
    if (headVersion == null) return;
    promote.mutate(
      { agentId, version: headVersion },
      { onSuccess: () => onClose() },
    );
  };

  const footer = (
    <div style={s.footer}>
      {promote.isError && <span style={s.promoteError}>{COPY.promoteFailed}</span>}
      <Button kind="tertiary" size="sm" onClick={onClose}>
        {COPY.close}
      </Button>
      <Button
        kind="primary"
        size="sm"
        icon="TrendingUp"
        disabled={!canPromote}
        loading={promote.isPending}
        onClick={doPromote}
        title={headVersion == null ? COPY.promoteUnavailable : undefined}
      >
        {COPY.promote(versionLabel(headVersion))}
      </Button>
    </div>
  );

  return (
    <Modal width={760} title={COPY.title} subtitle={COPY.subtitle} onClose={onClose} footer={footer}>
      <div style={s.body}>
        {isLoading && (
          <div style={s.cards}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        )}

        {isError && <div style={s.notice}>{COPY.loadError}</div>}

        {data && (
          <>
            <div style={s.versions}>
              {COPY.comparing(
                versionLabel(data.base.agent_version),
                versionLabel(data.head.agent_version),
              )}
            </div>

            <div style={s.cards} role="list" aria-label={COPY.deltasLabel}>
              {METRICS.map((m) => {
                const value = batchMetric(data.head, m.key);
                const d = deltaMetric(data.delta, m.key);
                return (
                  <div key={m.key} style={s.card} role="listitem">
                    <span style={s.cardLabel}>{m.label}</span>
                    <span style={s.cardValue}>{pct(value)}</span>
                    <span style={{ ...s.cardDelta, color: deltaColor(d) }}>{deltaPts(d)}</span>
                  </div>
                );
              })}
              <div style={s.card} role="listitem">
                <span style={s.cardLabel}>{COPY.passRate}</span>
                <span style={s.cardValue}>{pct(data.head.pass_rate)}</span>
                <span style={{ ...s.cardDelta, color: deltaColor(data.delta.pass_rate) }}>
                  {deltaPts(data.delta.pass_rate)}
                </span>
              </div>
            </div>

            <PromptDiffPanel
              basePrompt={data.base_prompt}
              headPrompt={data.head_prompt}
              baseLabel={versionLabel(data.base.agent_version)}
              headLabel={versionLabel(data.head.agent_version)}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

export default CompareModal;
