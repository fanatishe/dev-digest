"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { s } from "./styles";

/**
 * Stats tab. "Used by N agents" + the agents-using list are real (from
 * agent_skills). Pull frequency / accept rate / findings / by-category are scaffold
 * placeholders until reviews attribute findings to the skills that produced them.
 */
export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data, isLoading } = useSkillStats(skill.id);

  return (
    <div style={s.wrap}>
      <div style={s.metrics}>
        <div style={s.metric}>
          <div style={s.metricLabel}>{t("stats.usedBy")}</div>
          {isLoading ? <Skeleton height={28} width={60} /> : (
            <div style={s.metricValue}>
              {data?.used_by ?? 0} <span style={s.metricUnit}>{t("stats.usedByUnit")}</span>
            </div>
          )}
        </div>
        <ScaffoldMetric label={t("stats.pullFrequency")} note={t("stats.scaffold")} />
        <ScaffoldMetric label={t("stats.acceptRate")} note={t("stats.scaffold")} />
        <ScaffoldMetric label={t("stats.findings30d")} note={t("stats.scaffold")} />
      </div>

      <div style={s.panels}>
        <div style={s.panel}>
          <div style={s.panelHeading}>{t("stats.agentsHeading")}</div>
          {isLoading ? (
            <Skeleton height={40} />
          ) : data && data.agents.length > 0 ? (
            data.agents.map((a) => (
              <div key={a.id} style={s.agentRow}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.name}</span>
                <Button kind="ghost" size="sm" onClick={() => router.push(`/agents/${a.id}?tab=config`)}>
                  {t("stats.open")}
                </Button>
              </div>
            ))
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("stats.noAgents")}</p>
          )}
        </div>

        <div style={s.panel}>
          <div style={s.panelHeading}>{t("stats.findingsByCategory")}</div>
          <div style={s.scaffoldBox}>
            <Badge color="var(--text-muted)">{t("stats.scaffold")}</Badge>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>
              {t("stats.scaffoldNote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScaffoldMetric({ label, note }: { label: string; note: string }) {
  return (
    <div style={s.metric}>
      <div style={s.metricLabel}>{label}</div>
      <div style={s.metricValueMuted}>—</div>
      <div style={s.scaffoldTag}>{note}</div>
    </div>
  );
}
