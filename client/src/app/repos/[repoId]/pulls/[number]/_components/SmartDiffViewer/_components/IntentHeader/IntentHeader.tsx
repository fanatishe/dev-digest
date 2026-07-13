/* IntentHeader — the PR's stored intent sentence + risk chips, sitting above the
   grouped diff so the reader knows what the PR is TRYING to do before reading a
   single hunk. Free: the intent is already persisted (PK = pr_id), fetched by the
   existing `useIntent` hook in DiffTab — no model call happens here.

   The sentence and the chips are LLM-authored from untrusted, author-controlled
   PR text: rendered as plain text through JSX (which escapes), never
   dangerouslySetInnerHTML, and never turned into a link. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { s } from "../../styles";

export function IntentHeader({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("prReview");
  const risks = intent.risk_areas ?? [];

  return (
    <section style={s.intentCard}>
      <div style={s.intentHead}>
        <Icon.Target size={13} style={{ color: "var(--text-muted)" }} aria-hidden />
        <h3 style={s.intentLabel}>{t("smartDiff.intentHeader")}</h3>
        {intent.is_stale === true && (
          <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
            {t("smartDiff.stale")}
          </Badge>
        )}
      </div>
      <p style={s.intentText}>{intent.intent}</p>
      {risks.length > 0 && (
        <div style={s.chips}>
          {risks.map((risk, i) => (
            // Badge (a <span>), not Chip (a <button>) — these are labels, not controls.
            <Badge
              key={`${i}-${risk}`}
              icon="AlertTriangle"
              color="var(--warn)"
              bg="transparent"
              style={{ border: "1px solid var(--border)", padding: "4px 9px" }}
            >
              <span style={{ color: "var(--text-secondary)" }}>{risk}</span>
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}
