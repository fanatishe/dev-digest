"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { useConfirm } from "@/lib/confirm";
import { TYPE_COLOR } from "../SkillsWorkbench/constants";
import { needsVetting } from "../SkillsWorkbench/helpers";
import { s } from "./styles";

/** A left-list skill row — type/source badges, enabled toggle, usage stats line. */
export function SkillCard({ skill, active, onClick }: { skill: Skill; active?: boolean; onClick?: () => void }) {
  const t = useTranslations("skills");
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const confirm = useConfirm();
  const color = TYPE_COLOR[skill.type];
  const vetting = needsVetting(skill);

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </div>
        <span style={s.name} className="mono">
          {skill.name}
        </span>
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} size={14} />
        </div>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            const ok = await confirm({
              title: "Delete skill?",
              message: `Delete skill "${skill.name}"? It will be unlinked from all agents. This cannot be undone.`,
              confirmLabel: "Delete",
              danger: true,
            });
            if (ok) del.mutate(skill.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={13} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <Badge color={color} bg={color + "1a"}>
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <span style={s.source}>
          {skill.source !== "manual" && <Icon.Globe size={11} />}
          {t(`listItem.source.${skill.source}`)}
        </span>
        {vetting && (
          <Badge color="var(--warn, #b58900)" icon="AlertTriangle" style={{ background: "transparent", padding: 0 }}>
            {t("listItem.needsVetting")}
          </Badge>
        )}
      </div>
      <div style={s.stats}>
        <span style={s.statStrong}>{t("card.agents", { count: skill.used_by ?? 0 })}</span>
        <span style={s.statMuted}>· {t("card.pull")}</span>
        <span style={s.statMuted}>· {t("card.accept")}</span>
      </div>
    </div>
  );
}
