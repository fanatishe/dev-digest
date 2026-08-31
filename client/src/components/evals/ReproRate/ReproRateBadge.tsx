/* ReproRateBadge — the headline reproduction metric as a compact N/M badge, green
   when the case reproduces reliably (ratio >= 0.8, AC-14). Accepts either the raw
   runs (newest-first, as the runs endpoint returns them) or a precomputed
   EvalReproducibility; the pass/fail meaning is carried in an accessible label, not
   colour alone, so a screen reader (and RTL) can tell reliable from unstable. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalReproducibility, EvalRunRecord } from "@devdigest/shared";
import { reproRate } from "@/lib/evals/repro";
import { s } from "./styles";

export function ReproRateBadge({
  runs,
  repro,
  window,
}: {
  runs?: readonly EvalRunRecord[];
  repro?: EvalReproducibility;
  window?: number;
}) {
  const t = useTranslations("eval");
  const r = repro ?? reproRate(runs ?? [], window);

  if (r.total === 0) {
    return (
      <Badge color="var(--text-muted)" bg="transparent" style={{ border: "1px solid var(--border)" }}>
        {t("repro.noRuns")}
      </Badge>
    );
  }

  const label = r.reliable
    ? t("repro.reliableAria", { passed: r.passed, total: r.total })
    : t("repro.unstableAria", { passed: r.passed, total: r.total });

  return (
    <span role="status" aria-label={label} style={s.badgeWrap}>
      <Badge
        dot
        color={r.reliable ? "var(--ok)" : "var(--warn)"}
        bg="transparent"
        style={{ border: "1px solid var(--border)" }}
      >
        {r.passed}/{r.total}
      </Badge>
    </span>
  );
}
