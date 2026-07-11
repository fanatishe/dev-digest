/* ConventionCandidateCard — one extracted house-rule: the rule text, its cited
   file:line evidence snippet, a confidence bar, and Accept / Reject actions.
   Accept toggles the persisted `accepted` flag; Reject removes the candidate.
   Mirrors FindingCard's accept/dismiss button pattern. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { s, confidenceColor } from "./styles";

export function ConventionCandidateCard({
  candidate,
  pending,
  onAccept,
  onReject,
}: {
  candidate: ConventionCandidate;
  pending?: boolean;
  onAccept: (next: boolean) => void;
  onReject: () => void;
}) {
  const t = useTranslations("conventions");
  const pct = Math.round(candidate.confidence * 100);
  const color = confidenceColor(pct);
  const accepted = candidate.accepted;
  const [copied, setCopied] = React.useState(false);

  const copyEvidence = async () => {
    try {
      await navigator.clipboard.writeText(candidate.evidence_snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div style={s.card(accepted)}>
      <div style={s.main}>
        <div style={s.rule}>{candidate.rule}</div>

        <div style={s.evidence}>
          <div style={s.evidenceBar}>
            <span className="mono" style={s.evidencePath}>
              {candidate.evidence_path}
            </span>
            <div style={{ flex: 1 }} />
            <IconBtn
              icon={copied ? "Check" : "Copy"}
              label={t("card.copy")}
              onClick={copyEvidence}
            />
          </div>
          <pre style={s.snippet}>
            <code className="mono">{candidate.evidence_snippet}</code>
          </pre>
        </div>

        <div style={s.confidenceRow}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <span style={s.track}>
            <span style={s.fill(pct, color)} />
          </span>
          <span className="mono tnum" style={{ color, fontSize: 12 }}>
            {pct}%
          </span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          active={accepted}
          disabled={pending}
          onClick={() => onAccept(!accepted)}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button kind="ghost" size="sm" icon="X" disabled={pending} onClick={onReject}>
          {t("card.reject")}
        </Button>
      </div>
    </div>
  );
}
