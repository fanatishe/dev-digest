/* SkillEditor — the right-hand tabbed detail panel (Config/Preview/Evals/Stats/
   Versions). In draft mode (no `skill`) it shows only the Config tab; on first save
   it calls `onCreated` so the workbench can route to the new skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TABS } from "./constants";
import { TYPE_COLOR } from "../SkillsWorkbench/constants";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";
import { StatsTab } from "./_components/StatsTab";
import { EvalsTab } from "./_components/EvalsTab";

export function SkillEditor({
  skill,
  tab,
  onTab,
  onCreated,
  onCancelDraft,
}: {
  skill?: Skill;
  tab: string;
  onTab: (t: string) => void;
  onCreated?: (created: Skill) => void;
  onCancelDraft?: () => void;
}) {
  const t = useTranslations("skills");
  const isDraft = skill == null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <div style={header}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 className="mono" style={{ fontSize: 17, fontWeight: 700 }}>
          {isDraft ? t("editor.newSkill") : skill.name}
        </h1>
        {!isDraft && (
          <>
            <Badge color={TYPE_COLOR[skill.type]} bg={TYPE_COLOR[skill.type] + "1a"}>
              {t(`listItem.type.${skill.type}`)}
            </Badge>
            <Badge>{t("preview.version", { version: skill.version })}</Badge>
            <div style={{ marginLeft: "auto" }}>
              <Button kind="secondary" size="sm" icon="Play" disabled title={t("evals.body")}>
                {t("editor.runOnEvals")}
              </Button>
            </div>
          </>
        )}
      </div>

      {isDraft ? (
        <div style={{ flex: 1, overflow: "auto" }}>
          <ConfigTab {...(onCreated ? { onCreated } : {})} {...(onCancelDraft ? { onCancel: onCancelDraft } : {})} />
        </div>
      ) : (
        <>
          <div style={{ flexShrink: 0 }}>
            <Tabs
              pad="0 24px"
              value={tab}
              onChange={onTab}
              tabs={TABS.map((tb) => ({ key: tb.key, label: t(`editor.tabs.${tb.labelKey}`), icon: tb.icon }))}
            />
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {tab === "preview" ? (
              <PreviewTab skill={skill} />
            ) : tab === "evals" ? (
              <EvalsTab />
            ) : tab === "stats" ? (
              <StatsTab skill={skill} />
            ) : tab === "versions" ? (
              <VersionsTab skill={skill} />
            ) : (
              <ConfigTab key={skill.id} skill={skill} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "16px 24px 12px",
  flexShrink: 0,
  borderBottom: "1px solid var(--border)",
};
