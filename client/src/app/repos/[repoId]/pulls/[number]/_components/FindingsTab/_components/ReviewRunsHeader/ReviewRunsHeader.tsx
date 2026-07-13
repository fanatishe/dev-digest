"use client";

import { useTranslations } from "next-intl";
import { SectionLabel, Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/ui";

/** "Review runs" section header. Carries the findings total — the tab's own
 *  counter counts RUNS, so this is where "how much did they find" lives — plus
 *  the active severity filter as a clearable chip, or a hint when unfiltered. */
export function ReviewRunsHeader({
  severity,
  findingsCount,
  onClearSeverity,
}: {
  severity?: Severity | null;
  findingsCount: number;
  onClearSeverity?: () => void;
}) {
  const t = useTranslations("prReview");

  return (
    <SectionLabel
      icon="AlertOctagon"
      right={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {findingsCount > 0 && (
            <span className="tnum" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {t("reviewRuns.findingsCount", { count: findingsCount })}
            </span>
          )}
          {severity ? (
            <button
              type="button"
              onClick={onClearSeverity}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 12,
                color: SEV[severity]?.c ?? "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {t("reviewRuns.severityOnly", { severity: SEV[severity]?.label ?? severity })}
              <Icon.X size={12} />
            </button>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("reviewRuns.hint")}</span>
          )}
        </span>
      }
    >
      {t("reviewRuns.title")}
    </SectionLabel>
  );
}
