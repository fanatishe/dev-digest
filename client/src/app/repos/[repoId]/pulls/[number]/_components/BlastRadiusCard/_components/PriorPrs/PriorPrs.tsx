/* PriorPrs — "which merged PRs last touched the files this PR changes?"

   The `notes` line is DERIVED on the server from the file overlap (see
   server/src/modules/pulls/history.ts), not written by a model. It says something we
   can point at in the git log — which of this PR's files that PR also touched — rather
   than an editorial judgement nobody can check. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrHistoryItem } from "@devdigest/shared";
import { githubPrUrl } from "@/lib/github-urls";
import { s } from "../../styles";

interface PriorPrsProps {
  history: PrHistoryItem[];
  /** `owner/name` — null renders the PR numbers as plain text rather than dead links. */
  repoFullName: string | null;
}

export function PriorPrs({ history, repoFullName }: PriorPrsProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);

  return (
    <section style={s.priorPrs}>
      <button
        type="button"
        style={s.disclosure}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon.History size={13} aria-hidden />
        <span>{t("priorPrs.title")}</span>
        <span style={s.callerCount} className="tnum">
          {history.length}
        </span>
        {open ? <Icon.ChevronDown size={13} aria-hidden /> : <Icon.ChevronRight size={13} aria-hidden />}
      </button>

      {open && (
        <>
          {history.length === 0 ? (
            <p style={{ ...s.muted, marginTop: 10 }}>{t("priorPrs.empty")}</p>
          ) : (
            <ul style={s.prList}>
              {history.map((item) => (
                <li key={item.pr_number} style={s.prItem}>
                  <div style={s.prHead}>
                    {repoFullName ? (
                      <a
                        style={s.prNumber}
                        href={githubPrUrl(repoFullName, item.pr_number)}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={t("priorPrs.openPr", { number: item.pr_number })}
                      >
                        #{item.pr_number}
                      </a>
                    ) : (
                      <span style={s.prNumber}>#{item.pr_number}</span>
                    )}
                    <span style={s.prTitle}>{item.title}</span>
                  </div>
                  <span style={s.prMeta} className="tnum">
                    {item.author} · {item.merged_at.slice(0, 10)}
                  </span>
                  {item.notes && <p style={s.prNotes}>{item.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
