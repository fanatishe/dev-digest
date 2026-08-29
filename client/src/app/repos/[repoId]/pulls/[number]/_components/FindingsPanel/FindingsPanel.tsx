/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction, usePrReviews } from "../../../../../../../lib/hooks/reviews";
import { EvalCaseModal } from "@/components/evals/EvalCaseModal";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  severity = null,
  revealFindingId = null,
  revealNonce = 0,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When set, only findings of this severity are shown (from `?severity=`). */
  severity?: Severity | null;
  /** A finding to reveal (expand + scroll) — from "open finding" in a popover. */
  revealFindingId?: string | null;
  /** Bump to re-trigger the reveal for the same finding id. */
  revealNonce?: number;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);
  // The finding currently being turned into an eval case (owns the modal).
  const [evalTarget, setEvalTarget] = React.useState<FindingRecord | null>(null);

  // An eval case must attribute to an agent, so a finding can only be turned into
  // one when its owning review has an agent_id (AC-3). The review set is the same
  // cache the parent ReviewRunAccordion already populated (["reviews", prId]).
  const reviews = usePrReviews(prId).data;
  const agentByReview = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of reviews ?? []) if (r.agent_id) map.set(r.id, r.agent_id);
    return map;
  }, [reviews]);
  const agentIdFor = (f: FindingRecord): string | null => agentByReview.get(f.review_id) ?? null;
  const evalAgentId = evalTarget ? agentIdFor(evalTarget) : null;

  const shown = React.useMemo(() => {
    const list = visibleFindings(findings, hideLow, severity);
    // A revealed finding must be visible even if a filter/hide-low would drop it.
    if (revealFindingId && !list.some((f) => f.id === revealFindingId)) {
      const target = findings.find((f) => f.id === revealFindingId);
      if (target) return [target, ...list];
    }
    return list;
  }, [findings, hideLow, severity, revealFindingId]);

  // Move keyboard focus to the revealed finding when its nonce changes.
  const shownRef = React.useRef(shown);
  shownRef.current = shown;
  React.useEffect(() => {
    if (!revealNonce || !revealFindingId) return;
    const idx = shownRef.current.findIndex((f) => f.id === revealFindingId);
    if (idx >= 0) setFocusIdx(idx);
  }, [revealNonce, revealFindingId]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              reveal={f.id === revealFindingId ? revealNonce : undefined}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
              onTurnIntoEval={agentIdFor(f) ? () => setEvalTarget(f) : undefined}
            />
          ))
        )}
      </div>

      {evalTarget && evalAgentId && (
        <EvalCaseModal
          owner={{ kind: "agent", id: evalAgentId }}
          finding={evalTarget}
          prId={prId}
          onClose={() => setEvalTarget(null)}
        />
      )}
    </div>
  );
}
