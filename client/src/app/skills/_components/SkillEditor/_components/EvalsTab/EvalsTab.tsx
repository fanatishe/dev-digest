"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";

/** Evals tab — scaffold; skill evals against a labeled set arrive in a later lesson. */
export function EvalsTab() {
  const t = useTranslations("skills");
  return (
    <div style={{ padding: 40 }}>
      <EmptyState icon="FlaskConical" title={t("evals.title")} body={t("evals.body")} />
    </div>
  );
}
