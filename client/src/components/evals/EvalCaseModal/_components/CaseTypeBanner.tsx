/* CaseTypeBanner — the POSITIVE / NEGATIVE case flag at the top of the modal's left
   column. It names the expectation kind the case asserts:
     - must_find     → POSITIVE CASE (the agent MUST surface this finding)
     - must_not_flag → NEGATIVE CASE (the agent MUST NOT flag here)

   Two modes:
     - read-only (finding-derived): the kind is DERIVED from the finding's accept/dismiss
       decision, so the banner is a static label with the seeded caption.
     - editable (blank create + edit): no finding to derive from, so the banner is a
       toggle — clicking flips positive ↔ negative, which the modal syncs into the
       expected-output `kind`(s). Exposed as role="switch" so it stays queryable/operable. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalExpectedFinding } from "@devdigest/shared";
import { s } from "../styles";

type Kind = EvalExpectedFinding["kind"];

export function CaseTypeBanner({
  kind,
  editable,
  onToggle,
  caption,
}: {
  kind: Kind;
  editable: boolean;
  /** Called with the OTHER kind when the banner is toggled (editable only). */
  onToggle?: (next: Kind) => void;
  caption: string;
}) {
  const t = useTranslations("eval");
  const positive = kind === "must_find";
  const heading = positive ? t("caseModal.positiveCase") : t("caseModal.negativeCase");
  const KindIcon = positive ? Icon.CheckCircle : Icon.XCircle;

  const content = (
    <>
      <span style={s.caseTypeHeading(positive)}>
        <KindIcon size={15} aria-hidden />
        {heading}
      </span>
      <span style={s.expectationDesc}>{caption}</span>
    </>
  );

  if (!editable) {
    return <div style={s.expectationCard(positive)}>{content}</div>;
  }

  const next: Kind = positive ? "must_not_flag" : "must_find";
  return (
    <button
      type="button"
      aria-label={t("caseModal.toggleKindAria")}
      title={t("caseModal.toggleKindHint")}
      onClick={() => onToggle?.(next)}
      style={s.caseTypeToggle(positive)}
    >
      {content}
      <span style={s.caseTypeHint}>{t("caseModal.toggleKindHint")}</span>
    </button>
  );
}
