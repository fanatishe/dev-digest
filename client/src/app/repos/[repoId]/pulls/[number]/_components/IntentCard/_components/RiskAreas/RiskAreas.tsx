/* RiskAreas — the RISK AREAS section body of the Intent card. PRESENTATIONAL: it takes
   the review's findings + callbacks as props; `OverviewTab` owns the data hook and
   `IntentCard` threads them through.

   Findings are already computed and diff-grounded by the reviewer (no model call is
   spent to show them). Each finding is a selectable block: clicking its CHEVRON selects
   it and reveals its rationale in the single detail panel below the whole list (one open
   at a time); clicking the block BODY reveals that file in the Files-changed tab. Every
   string rendered (titles, rationale) is author/LLM-derived text — escaped by JSX, never
   dangerouslySetInnerHTML. */
"use client";

import React from "react";
import { Badge, Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useTranslations } from "next-intl";
import { sevToken } from "@/lib/severity";
import { fileRef, findingIcon } from "./helpers";
import { s } from "./styles";

const SEV_RANK: Record<string, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

interface RiskAreasProps {
  /** The latest review's non-dismissed findings, already ordered (severity desc). */
  findings: FindingRecord[];
  /** Fallback chips from the intent classifier, shown when no review has run yet. */
  intentRisks: string[];
  /** Reveal a changed file in the Files-changed tab. */
  onOpenFile: (file: string) => void;
}

export function RiskAreas({ findings, intentRisks, onOpenFile }: RiskAreasProps) {
  const t = useTranslations("brief");
  // Single-select accordion: at most one finding's detail is open at a time.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Card-level colour dot = the worst severity present. Derived during render.
  const worst = findings.reduce(
    (acc, f) => ((SEV_RANK[f.severity] ?? 0) > (SEV_RANK[acc] ?? 0) ? f.severity : acc),
    "SUGGESTION",
  );
  const selected = findings.find((f) => f.id === selectedId) ?? null;

  return (
    <section>
      <div style={s.header}>
        <h3 style={s.label("var(--text-muted)")}>
          <Icon.AlertTriangle size={13} aria-hidden />
          {t("intent.riskAreas")}
        </h3>
        {findings.length > 0 && (
          <div style={s.headerRight}>
            <Badge color={sevToken(worst)} bg="transparent" style={{ padding: "2px 8px" }}>
              <span style={s.levelDot(sevToken(worst))} aria-hidden />
              {t("riskBrief.count", { count: findings.length })}
            </Badge>
          </div>
        )}
      </div>

      {findings.length === 0 ? (
        <div>
          <p style={s.emptyHint}>{t("riskBrief.emptyHint")}</p>
          {intentRisks.length > 0 && (
            <>
              <p style={s.fallbackNote}>{t("riskBrief.fallback")}</p>
              <div style={s.chips}>
                {intentRisks.map((risk, i) => (
                  <Badge
                    key={`${i}-${risk}`}
                    icon="AlertTriangle"
                    color="var(--warn)"
                    bg="transparent"
                    style={{ border: "1px solid var(--border)", padding: "5px 10px" }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>{risk}</span>
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={s.risks}>
            {findings.map((f) => (
              <RiskRow
                key={f.id}
                finding={f}
                selected={f.id === selectedId}
                onToggle={() => setSelectedId((cur) => (cur === f.id ? null : f.id))}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
          {selected && (
            <div style={s.detail} role="region" aria-label={selected.title}>
              <p style={s.explanation}>{selected.rationale}</p>
              {selected.suggestion && <p style={s.suggestion}>{selected.suggestion}</p>}
              <button
                type="button"
                className="mono"
                style={s.detailRef}
                onClick={() => onOpenFile(selected.file)}
              >
                {fileRef(selected)}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** One risk block: a chevron button that SELECTS the finding (opens its detail below),
 *  and a separate body button that OPENS the file in the diff. Two distinct targets, so
 *  neither nests inside the other (no invalid nested-button markup). */
function RiskRow({
  finding,
  selected,
  onToggle,
  onOpenFile,
}: {
  finding: FindingRecord;
  selected: boolean;
  onToggle: () => void;
  onOpenFile: (file: string) => void;
}) {
  const color = sevToken(finding.severity);
  const IconEl = Icon[findingIcon(finding)];

  return (
    <div style={s.risk(selected)}>
      <button type="button" style={s.riskMain} onClick={() => onOpenFile(finding.file)}>
        <IconEl size={14} style={{ color, flex: "0 0 auto", marginTop: 2 }} aria-hidden />
        <span style={s.riskText}>
          <span style={s.riskTitle}>{finding.title}</span>
          <span className="mono" style={s.riskRef}>
            {fileRef(finding)}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-expanded={selected}
        aria-label={`Toggle details for ${finding.title}`}
        style={s.chevronBtn}
        onClick={onToggle}
      >
        <Icon.ChevronRight size={14} style={s.chevron(selected)} aria-hidden />
      </button>
    </div>
  );
}
