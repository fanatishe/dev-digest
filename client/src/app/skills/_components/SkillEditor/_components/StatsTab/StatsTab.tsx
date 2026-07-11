"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Donut, Skeleton, type DonutSegment } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "@/lib/hooks/skills";
import { s } from "./styles";

/**
 * Stats tab. "Used by N agents" + the agents-using list are real (from agent_skills).
 * Pull frequency / accept rate / findings / by-category are SAMPLE values (labeled as
 * such below the metric row) until reviews attribute findings to the skills that
 * produced them — a later lesson. The layout is final; only the data source is stubbed.
 */

const SAMPLE = { pullFrequency: 71, acceptRate: 74, findings30d: 96 };
const SAMPLE_CATEGORIES: DonutSegment[] = [
  { label: "security", value: 52, color: "#f87171" },
  { label: "bug", value: 20, color: "#fbbf24" },
  { label: "perf", value: 16, color: "#a78bfa" },
  { label: "style", value: 12, color: "#60a5fa" },
];

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data, isLoading } = useSkillStats(skill.id);

  return (
    <div style={s.wrap}>
      <div style={s.metrics}>
        <Metric label={t("stats.usedBy")}>
          {isLoading ? (
            <Skeleton height={28} width={60} />
          ) : (
            <div style={s.metricValue}>
              {data?.used_by ?? 0} <span style={s.metricUnit}>{t("stats.usedByUnit")}</span>
            </div>
          )}
        </Metric>
        <Metric label={t("stats.pullFrequency")}>
          <div style={s.metricValue}>
            {SAMPLE.pullFrequency}
            <span style={s.metricUnit}>%</span>
          </div>
        </Metric>
        <Metric label={t("stats.acceptRate")} corner={<Ring pct={SAMPLE.acceptRate} color="#f0b429" />}>
          <div style={s.metricValue}>
            {SAMPLE.acceptRate}
            <span style={s.metricUnit}>%</span>
          </div>
        </Metric>
        <Metric label={t("stats.findings30d")}>
          <div style={s.metricValue}>{SAMPLE.findings30d}</div>
        </Metric>
      </div>
      <p style={s.caption}>{t("stats.sampleData")}</p>

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
          <div style={s.donutWrap}>
            <Donut segments={SAMPLE_CATEGORIES} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  corner,
  children,
}: {
  label: string;
  corner?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={s.metric}>
      <div style={s.metricHead}>
        <div style={s.metricLabel}>{label}</div>
        {corner}
      </div>
      {children}
    </div>
  );
}

/** Circular progress ring for a percentage (accent arc over a track). */
function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 15;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden>
      <circle cx={20} cy={20} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
      <circle
        cx={20}
        cy={20}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${(circ * pct) / 100} ${circ}`}
        transform="rotate(-90 20 20)"
      />
      <text
        x={20}
        y={20}
        textAnchor="middle"
        dominantBaseline="central"
        className="mono"
        style={{ fontSize: 11, fontWeight: 700, fill: "var(--text-secondary)" }}
      >
        {pct}
      </text>
    </svg>
  );
}
