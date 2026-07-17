/* ReviewFocus — the "read these first" section below the Overview grid. An ordered list
   of the highest-signal findings (severity-ranked), each a `file:line` link into the
   Files-changed tab plus its title as the one-line reason. PRESENTATIONAL: `OverviewTab`
   owns the data hook and hands down the already-ordered, capped findings.

   Titles are author/LLM-derived text — escaped by JSX, never dangerouslySetInnerHTML.
   Every finding is diff-grounded by the reviewer, so its `file` is always a live reveal
   link. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { fileRef } from "./helpers";
import { s } from "./styles";

interface ReviewFocusProps {
  /** The top findings to read first, already ordered by the container. */
  findings: FindingRecord[];
  /** Reveal a changed file in the Files-changed tab. */
  onOpenFile: (file: string) => void;
}

export function ReviewFocus({ findings, onOpenFile }: ReviewFocusProps) {
  const t = useTranslations("brief");

  if (findings.length === 0) return null;

  return (
    <section style={s.section}>
      <SectionLabel
        icon="ListChecks"
        right={<span style={s.count}>{t("riskBrief.focusCount", { count: findings.length })}</span>}
      >
        {t("riskBrief.reviewFocus")}
      </SectionLabel>
      <ol style={s.list}>
        {findings.map((f, i) => (
          <li key={f.id} style={s.item}>
            <span style={s.ordinal} aria-hidden>
              {i + 1}
            </span>
            <span style={s.ref}>
              <button
                type="button"
                className="mono"
                style={s.link}
                onClick={() => onOpenFile(f.file)}
              >
                {fileRef(f)}
              </button>
            </span>
            <span style={s.reason}>{f.title}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
