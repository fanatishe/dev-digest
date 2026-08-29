/* ExpectationBadge — a small, reusable badge naming an eval expectation's kind
   (MUST FIND / MUST NOT FLAG). Text + icon, never colour alone (WCAG AA), so it
   stays queryable by role/text. Shared by the EvalCaseModal and (WP-F) the
   EvalCaseRow. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { EvalExpectedFinding } from "@devdigest/shared";

export function ExpectationBadge({ kind }: { kind: EvalExpectedFinding["kind"] }) {
  const t = useTranslations("eval");
  const positive = kind === "must_find";
  return (
    <Badge
      icon={positive ? "CheckCircle" : "XCircle"}
      color={positive ? "var(--ok)" : "var(--warn)"}
      bg="transparent"
      style={{ border: "1px solid var(--border)", textTransform: "uppercase" }}
    >
      {positive ? t("expectation.mustFind") : t("expectation.mustNotFlag")}
    </Badge>
  );
}
