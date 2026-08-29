/* ReproRateStrip — a run-by-run pass/fail strip plus a one-line summary, shown in
   the EvalCaseModal after a "Run on save" (AC-5) and reusable wherever the last-N
   runs of a case are on hand. A single run reads "Last run passed/failed"; several
   read "N/M reproduced". Reproduction is computed with the shared pure `reproRate`
   (WP-D) so the strip and the badge can never disagree. */
"use client";

import { useTranslations } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import { reproRate, REPRO_DEFAULT_WINDOW } from "@/lib/evals/repro";
import { s } from "./styles";

export function ReproRateStrip({
  runs,
  window = REPRO_DEFAULT_WINDOW,
}: {
  runs: readonly EvalRunRecord[];
  window?: number;
}) {
  const t = useTranslations("eval");
  const recent = runs.slice(0, Math.max(0, window));
  const r = reproRate(runs, window);

  const summary =
    r.total === 1
      ? r.passed === 1
        ? t("repro.lastPassed")
        : t("repro.lastFailed")
      : t("repro.reproduced", { passed: r.passed, total: r.total });

  return (
    <div
      role="status"
      aria-label={t("repro.stripAria", { passed: r.passed, total: r.total })}
      style={s.strip(r.reliable)}
    >
      <span style={s.dots}>
        {recent.map((run) => (
          <span key={run.id} style={s.dot(run.pass)} />
        ))}
      </span>
      <span style={s.summary}>{summary}</span>
    </div>
  );
}
