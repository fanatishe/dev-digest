/* BlastTree — changed symbol → callers → endpoints/crons, as an expandable tree.

   NAVIGATION IS ASYMMETRIC, and that is not an oversight:

     · a CHANGED SYMBOL is in the diff, so it deep-links INTO the Files-changed tab.
     · a CALLER is not. Callers live in files this PR does not touch — that is the
       entire point of a blast radius — so the diff viewer structurally cannot show
       them. They link OUT to the file on GitHub, pinned to the PR's head sha so the
       line numbers are the ones we are quoting.

   Wiring a caller to the diff tab would silently land on "file not in this diff". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "../../styles";

interface BlastTreeProps {
  blast: BlastRadius;
  /** `owner/name`, for the GitHub deep links. Null → callers render unlinked. */
  repoFullName: string | null;
  /** The PR's head sha — pins a blob link's line numbers to the code we indexed. */
  headSha: string | null;
  /** Reveal a CHANGED file in the Files-changed tab. */
  onOpenFile: (file: string) => void;
}

export function BlastTree({ blast, repoFullName, headSha, onOpenFile }: BlastTreeProps) {
  const t = useTranslations("blast");
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());

  const toggle = (symbol: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  // `downstream` carries one entry per changed symbol — including symbols with no
  // callers. Those are kept deliberately: after the server's per-symbol cap fix,
  // "no downstream callers" is a real finding, not an artifact of a truncation.
  const byName = new Map(blast.downstream.map((d) => [d.symbol, d]));

  return (
    <div style={s.tree}>
      {blast.changed_symbols.map((sym) => {
        const impact = byName.get(sym.name);
        const isOpen = expanded.has(sym.name);
        const callerCount = impact?.callers.length ?? 0;

        return (
          <div key={`${sym.file}:${sym.name}`}>
            <button
              type="button"
              style={s.symbolRow}
              aria-expanded={isOpen}
              aria-label={t("expandSymbol", { symbol: sym.name })}
              onClick={() => toggle(sym.name)}
            >
              {isOpen ? (
                <Icon.ChevronDown size={13} aria-hidden />
              ) : (
                <Icon.ChevronRight size={13} aria-hidden />
              )}
              <Icon.Code size={13} aria-hidden />
              <span style={s.symbolName}>{sym.name}()</span>
              <span style={s.callerCount} className="tnum">
                {t("callerCount", { count: callerCount })}
              </span>
            </button>

            {isOpen && (
              <div style={s.children}>
                {/* The changed symbol IS in the diff — this one goes inward. */}
                <button
                  type="button"
                  style={{ ...s.callerLink, background: "none", border: "none", cursor: "pointer" }}
                  onClick={() => onOpenFile(sym.file)}
                  aria-label={t("openSymbol", { symbol: sym.name })}
                >
                  <Icon.FileText size={12} aria-hidden />
                  {sym.file}
                </button>

                {impact && <CallerList impact={impact} repoFullName={repoFullName} headSha={headSha} />}

                {impact && callerCount === 0 && (
                  <p style={s.muted}>{t("noCallersForSymbol")}</p>
                )}

                {impact && (impact.endpoints_affected.length > 0 || impact.crons_affected.length > 0) && (
                  <div style={s.badges}>
                    {impact.endpoints_affected.map((e) => (
                      <Badge key={e} icon="Globe" color="var(--accent)" bg="transparent"
                        style={{ border: "1px solid var(--border)" }}>
                        <span className="tnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{e}</span>
                      </Badge>
                    ))}
                    {impact.crons_affected.map((c) => (
                      <Badge key={c} icon="Clock" color="var(--warn)" bg="transparent"
                        style={{ border: "1px solid var(--border)" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{c}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Callers link OUT to GitHub — their files are not in this diff. */
function CallerList({
  impact,
  repoFullName,
  headSha,
}: {
  impact: DownstreamImpact;
  repoFullName: string | null;
  headSha: string | null;
}) {
  const t = useTranslations("blast");

  return (
    <>
      {impact.callers.map((c) => {
        const label = `${c.file}:${c.line}`;
        const body = (
          <>
            <Icon.CornerDownRight size={12} aria-hidden />
            <span className="tnum">{label}</span>
          </>
        );

        // No repo or no head sha → render the location as plain text rather than a
        // link that would 404. The information is still useful; the link is not.
        if (!repoFullName || !headSha) {
          return (
            <span key={`${c.file}:${c.line}:${c.name}`} style={s.callerLink}>
              {body}
            </span>
          );
        }

        return (
          <a
            key={`${c.file}:${c.line}:${c.name}`}
            style={s.callerLink}
            href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t("openCaller", { symbol: c.name, file: label })}
          >
            {body}
          </a>
        );
      })}
    </>
  );
}
