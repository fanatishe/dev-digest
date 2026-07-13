/* ConventionCandidateCard — one extracted house-rule: the rule text, its cited
   file:line evidence snippet, a confidence bar, and Accept / Reject actions.
   Accept toggles the persisted `accepted` flag; Reject removes the candidate.
   The rule is editable in place (click the text → textarea + Save/Cancel), and the
   evidence path deep-links to github.com at the commit the snippet was read from.
   Mirrors FindingCard's accept/dismiss buttons and its MonoLink file reference. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, MonoLink, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { githubBlobUrl, parseEvidencePath } from "@/lib/github-urls";
import { s, confidenceColor } from "./styles";

export function ConventionCandidateCard({
  candidate,
  repoFullName,
  pending,
  onAccept,
  onEditRule,
  onReject,
}: {
  candidate: ConventionCandidate;
  /** "owner/repo" — with the candidate's sha, turns the evidence into a GitHub link. */
  repoFullName?: string | null;
  pending?: boolean;
  onAccept: (next: boolean) => void;
  onEditRule?: (rule: string) => void;
  onReject: () => void;
}) {
  const t = useTranslations("conventions");
  const pct = Math.round(candidate.confidence * 100);
  const color = confidenceColor(pct);
  const accepted = candidate.accepted;
  const [copied, setCopied] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(candidate.rule);

  const copyEvidence = async () => {
    try {
      await navigator.clipboard.writeText(candidate.evidence_snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  // Only linkable when we know BOTH the repo and the commit the evidence was read at —
  // a link pinned to the wrong commit would point at the wrong lines. Candidates scanned
  // before `evidence_sha` was recorded simply render as plain text, as they do today.
  const { file, start, end } = parseEvidencePath(candidate.evidence_path);
  const evidenceHref =
    repoFullName && candidate.evidence_sha
      ? githubBlobUrl(repoFullName, candidate.evidence_sha, file, start, end)
      : undefined;

  const startEdit = () => {
    setDraft(candidate.rule);
    setEditing(true);
  };
  const cancelEdit = () => {
    setDraft(candidate.rule);
    setEditing(false);
  };
  const save = () => {
    const next = draft.trim();
    if (!next || next === candidate.rule) return cancelEdit();
    onEditRule?.(next);
    setEditing(false);
  };

  return (
    <div style={s.card(accepted)}>
      <div style={s.main}>
        {editing ? (
          <div
            style={s.editWrap}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelEdit();
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
            }}
          >
            <Textarea value={draft} onChange={setDraft} rows={3} />
            <div style={s.editActions}>
              <Button
                kind="primary"
                size="sm"
                icon="Check"
                disabled={pending || !draft.trim()}
                onClick={save}
              >
                {t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={cancelEdit} disabled={pending}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div style={s.ruleRow}>
            <div
              role="button"
              tabIndex={0}
              title={t("card.edit")}
              style={s.rule}
              onClick={startEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  startEdit();
                }
              }}
            >
              {candidate.rule}
            </div>
            <IconBtn icon="Edit" label={t("card.edit")} onClick={startEdit} />
          </div>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceBar}>
            {evidenceHref ? (
              <MonoLink href={evidenceHref}>{candidate.evidence_path}</MonoLink>
            ) : (
              <span className="mono" style={s.evidencePath}>
                {candidate.evidence_path}
              </span>
            )}
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
