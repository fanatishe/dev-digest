"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

/** Preview tab — the skill body rendered exactly as the reviewing agent receives it. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={{ padding: 28, maxWidth: 860 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700 }}>{t("editor.tabs.preview")}</h2>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 16px" }}>
        {t("preview.renderedAs")}
      </p>
      <div style={card}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "20px 24px",
  background: "var(--bg-elevated)",
};
