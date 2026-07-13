/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, an inline composer, and —
   when the latest review flagged this line — a clickable severity badge that
   deep-links to the finding on the Findings tab.

   `findings`/`onOpenFinding` are OPTIONAL, so the flat DiffViewer path is
   unchanged. Finding titles are LLM-authored from attacker-controlled source
   code: they are rendered as plain text through JSX (which escapes) and are only
   ever an accessible name / tooltip — never HTML, never an href. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type DiffFinding } from "../findings";
import { type Line } from "../helpers";
import { sevToken } from "@/lib/severity";
import { s, findingBadgeFor, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  onOpenFinding,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Review findings anchored to THIS line (RIGHT side) — badged in the row. */
  findings?: DiffFinding[];
  onOpenFinding?: (id: string) => void;
}) {
  const t = useTranslations("shell");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {(findings ?? []).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onOpenFinding?.(f.id)}
            title={f.title}
            aria-label={t("diffViewer.openFinding", { title: f.title })}
            style={findingBadgeFor(sevToken(f.severity))}
          >
            <Icon.AlertTriangle size={10} aria-hidden />
            {f.severity}
          </button>
        ))}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
