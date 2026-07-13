/* SmartDiffViewer — the PR's diff regrouped by ROLE (core → wiring → boilerplate)
   instead of GitHub's arbitrary file order, with the boilerplate group collapsed
   and a clickable severity badge on every line the latest review flagged.

   PRESENTATIONAL: groups, files, findings and the intent all arrive as props —
   `DiffTab` owns the hooks. The grouping is server-computed (a pure composition of
   pr_files + the latest review's findings; no LLM call), so there is no local
   mirror of it in state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, PrIntentRecord, SmartDiff } from "@devdigest/shared";
import { type DiffCommentApi, type DiffFinding } from "@/components/diff-viewer";
import { GroupSection } from "./_components/GroupSection";
import { IntentHeader } from "./_components/IntentHeader";
import { ROLE_ORDER } from "./constants";
import { byPath } from "./helpers";
import { s } from "./styles";

interface SmartDiffViewerProps {
  smart: SmartDiff;
  /** The PR's raw files — the smart diff carries the counts, these carry the patches. */
  files: PrFile[];
  /** Findings of the latest review; empty when the PR has never been reviewed. */
  findings: DiffFinding[];
  /** The stored intent, or null — the context header is omitted entirely when null. */
  intent: PrIntentRecord | null;
  commenting?: DiffCommentApi;
  /** Deep-link to a finding on the Findings tab (one router.replace, no reload). */
  onOpenFinding: (id: string) => void;
}

export function SmartDiffViewer({
  smart,
  files,
  findings,
  intent,
  commenting,
  onOpenFinding,
}: SmartDiffViewerProps) {
  const t = useTranslations("prReview");
  const patches = React.useMemo(() => byPath(files), [files]);

  // The server already orders the groups, but it only emits NON-EMPTY ones — sort
  // defensively so the reading order is core → wiring → boilerplate regardless.
  const groups = React.useMemo(
    () => [...smart.groups].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)),
    [smart.groups],
  );

  const split = smart.split_suggestion;

  return (
    <div style={s.wrap}>
      {intent && <IntentHeader intent={intent} />}

      {split.too_big && (
        <div style={s.advisory} role="note">
          <Icon.AlertTriangle size={14} aria-hidden />
          <span>{t("smartDiff.largeTitle", { lines: split.total_lines })}</span>
        </div>
      )}

      {groups.map((group) => (
        <GroupSection
          key={group.role}
          group={group}
          patches={patches}
          findings={findings}
          commenting={commenting}
          onOpenFinding={onOpenFinding}
        />
      ))}
    </div>
  );
}
