/* SkillsTab — attach/detach + reorder the skills linked to an agent. The
   checkbox is link membership; drag sets order (= order of the blocks in the
   assembled prompt). Skill *content* is edited on the /skills page, not here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Checkbox, Skeleton } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useSkills, useAgentSkills, useSetAgentSkills } from "@/lib/hooks/skills";

const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

export function SkillsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("agents");
  const { data: allSkills, isLoading } = useSkills();
  const { data: links } = useAgentSkills(agentId);
  const setSkills = useSetAgentSkills(agentId);

  const linkedFromServer = React.useMemo(() => (links ?? []).map((l) => l.skill_id), [links]);
  const [order, setOrder] = React.useState<string[]>(linkedFromServer);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");

  // Resync local order whenever the server set changes (post-mutation cache write).
  const serverKey = linkedFromServer.join(",");
  React.useEffect(() => setOrder(linkedFromServer), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: string[]) => {
    setOrder(next);
    setSkills.mutate(next);
  };

  if (isLoading) return <div style={wrap}><Skeleton height={40} /><Skeleton height={40} /></div>;

  const skills = allSkills ?? [];
  if (skills.length === 0) {
    return <div style={wrap}><p style={{ color: "var(--text-muted)", fontSize: 14 }}>{t("editor.skillsTab.empty")}</p></div>;
  }

  const byId = new Map(skills.map((s) => [s.id, s]));
  const matches = (s: Skill) =>
    !filter.trim() || [s.name, s.type].some((f) => f.toLowerCase().includes(filter.trim().toLowerCase()));

  const attached = order.map((id) => byId.get(id)).filter((s): s is Skill => !!s && matches(s));
  const available = skills.filter((s) => !order.includes(s.id) && matches(s)).sort((a, b) => a.name.localeCompare(b.name));

  // Reorder by id so drag stays correct even while filtered.
  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = order.filter((id) => id !== dragId);
    next.splice(next.indexOf(targetId), 0, dragId);
    commit(next);
    setDragId(null);
  };

  return (
    <div style={wrap}>
      <div style={headerRow}>
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>{t("editor.tabs.skills")}</h2>
        <Badge>{t("editor.skillsTab.count", { enabled: order.length, total: skills.length })}</Badge>
        <div style={{ flex: 1 }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("editor.skillsTab.filter")}
          style={filterInput}
        />
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        {t("editor.skillsTab.orderHint")}
      </p>

      {attached.length > 0 && (
        <>
          <div style={sectionLabel}>{t("editor.skillsTab.linkedHeading")}</div>
          {attached.map((sk) => (
            <div
              key={sk.id}
              draggable
              onDragStart={() => setDragId(sk.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(sk.id)}
              style={{ ...row, opacity: dragId === sk.id ? 0.5 : 1, cursor: "grab" }}
            >
              <Icon.Menu size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <Checkbox checked onChange={() => commit(order.filter((id) => id !== sk.id))} />
              <SkillRowLabel skill={sk} disabledTag={t("editor.skillsTab.disabledTag")} />
            </div>
          ))}
        </>
      )}

      {available.length > 0 && (
        <>
          <div style={{ ...sectionLabel, marginTop: 18 }}>{t("editor.skillsTab.availableHeading")}</div>
          {available.map((sk) => (
            <div key={sk.id} style={{ ...row, cursor: "default" }}>
              <span style={{ width: 15, flexShrink: 0 }} />
              <Checkbox checked={false} onChange={() => commit([...order, sk.id])} />
              <SkillRowLabel skill={sk} disabledTag={t("editor.skillsTab.disabledTag")} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function SkillRowLabel({ skill, disabledTag }: { skill: Skill; disabledTag: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
      <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{skill.name}</span>
      {!skill.enabled && (
        <Badge color="var(--text-muted)" style={{ background: "transparent", padding: "0 6px" }}>{disabledTag}</Badge>
      )}
      <div style={{ flex: 1 }} />
      <Badge color={TYPE_COLOR[skill.type]} bg={TYPE_COLOR[skill.type] + "1a"}>{skill.type}</Badge>
    </div>
  );
}

const wrap: React.CSSProperties = { padding: 28, maxWidth: 900 };
const headerRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 };
const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  margin: "0 0 8px",
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-elevated)",
  marginBottom: 8,
};
const filterInput: React.CSSProperties = {
  fontSize: 13,
  padding: "7px 11px",
  borderRadius: 7,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  outline: "none",
  width: 200,
};
