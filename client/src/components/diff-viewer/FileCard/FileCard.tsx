/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { indexFindings, findingsForLine, type DiffFinding } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  defaultOpen,
  findingCount,
  findings,
  onOpenFinding,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /**
   * Force the card's initial open state (Smart Diff collapses the boilerplate
   * group). Absent ⇒ today's `AUTO_EXPAND_MAX_LINES` rule, so the flat
   * DiffViewer path behaves exactly as before.
   */
  defaultOpen?: boolean;
  /**
   * How many findings the latest review left on this file — shown in the header.
   * Deliberately independent of the per-line badges: a finding whose `start_line`
   * falls OUTSIDE the patch's hunks has no row to badge (the model cites the whole
   * file, the diff only renders changed hunks), and without this the file would
   * look clean. The header count is the honest total.
   */
  findingCount?: number;
  /** Findings from the latest review, ANY file — filtered to this one here. */
  findings?: DiffFinding[];
  onOpenFinding?: (id: string) => void;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    defaultOpen ?? (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Same lookup shape as the comment threads: one Map<"RIGHT:<line>", …> per file.
  const findingsByLine = React.useMemo(
    () => indexFindings(findings ?? [], file.path),
    [findings, file.path],
  );

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    // `data-path` is the anchor the Blast-radius card scrolls to when you click a
    // changed symbol (DiffTab's `?file=` reveal). It lives on FileCard, not on a
    // viewer, so BOTH the flat DiffViewer and the SmartDiffViewer inherit it —
    // otherwise the reveal would silently do nothing in whichever view you were in.
    <div style={s.fileCard} data-path={file.path}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {!!findingCount && findingCount > 0 && (
          <span style={s.findingCount}>
            <Icon.AlertTriangle size={12} aria-hidden />
            {t("diffViewer.findingCount", { count: findingCount })}
          </span>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln, findingsByLine)}
                onOpenFinding={onOpenFinding}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
