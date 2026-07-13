/* GroupSection — one role group of the Smart Diff (core / wiring / boilerplate):
   a heading (label · description · file count) over the EXISTING diff-viewer
   FileCards, in the order the server sorted them (findings first, then size). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";
import { FileCard, type DiffCommentApi, type DiffFinding } from "@/components/diff-viewer";
import { COLLAPSED_ROLE, ROLE_META } from "../../constants";
import { toPrFile } from "../../helpers";
import { s } from "../../styles";

interface GroupSectionProps {
  group: SmartDiffGroup;
  /** The PR's raw files, indexed by path — they carry the patch text. */
  patches: Map<string, PrFile>;
  findings: DiffFinding[];
  commenting?: DiffCommentApi;
  onOpenFinding: (id: string) => void;
}

export function GroupSection({
  group,
  patches,
  findings,
  commenting,
  onOpenFinding,
}: GroupSectionProps) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[group.role];
  const RoleIcon = Icon[meta.icon];

  /**
   * Collapsing boilerplate hides NOISE — it must never hide a REVIEW FINDING.
   * A flagged file always opens, whatever group it landed in: the badge is the
   * whole point of the tab, and a badge inside a collapsed group is invisible.
   * This is not hypothetical — most findings land on `*.test.*` files, which
   * this classifier (correctly) calls boilerplate, so the group rule alone hid
   * every badge on the page. Otherwise: boilerplate collapsed, everything else
   * on the viewer's own size rule (`undefined` = defer to AUTO_EXPAND_MAX_LINES).
   */
  const openFor = (flagged: boolean): boolean | undefined =>
    flagged ? true : group.role === COLLAPSED_ROLE ? false : undefined;

  return (
    <section style={s.group}>
      <div style={s.groupHead}>
        <h3 style={s.groupTitle}>
          <RoleIcon size={13} aria-hidden />
          {t(meta.labelKey)}
        </h3>
        <span style={s.groupDesc}>{t(meta.descKey)}</span>
        <span style={s.groupCount}>{t("smartDiff.filesCount", { count: group.files.length })}</span>
      </div>
      {group.files.map((f) => (
        <FileCard
          key={f.path}
          file={toPrFile(f, patches)}
          defaultOpen={openFor(f.finding_lines.length > 0)}
          findingCount={f.finding_lines.length}
          commenting={commenting}
          findings={findings}
          onOpenFinding={onOpenFinding}
        />
      ))}
    </section>
  );
}
