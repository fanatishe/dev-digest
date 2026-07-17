/* ContextTab (skill) — attach / detach / reorder the project-context documents
   linked to a SKILL. Mirrors the agent Context tab on the same contract (AC-9): the
   checkbox is attachment membership, drag sets injection order, and only PATH
   strings are persisted — never bodies. Footer shows the derived running token
   total + over-budget indicator. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Checkbox, Skeleton, EmptyState } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { useSkill } from "@/lib/hooks/skills";
import { useContextDocs, useSetSkillContextDocs } from "@/lib/hooks/context-docs";
import { attachedTokens } from "./helpers";
import { s } from "./styles";

export function ContextTab({ skillId, repoId }: { skillId: string; repoId: string | null }) {
  const t = useTranslations("projectContext");
  const { data: skill } = useSkill(skillId);
  const { data, isLoading } = useContextDocs(repoId);
  const setDocs = useSetSkillContextDocs(skillId);

  const attachedFromServer = React.useMemo(() => skill?.context_docs ?? [], [skill?.context_docs]);
  const [order, setOrder] = React.useState<string[]>(attachedFromServer);
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");

  const serverKey = attachedFromServer.join("\n");
  React.useEffect(() => setOrder(attachedFromServer), [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: string[]) => {
    setOrder(next);
    setDocs.mutate(next);
  };

  if (!repoId) {
    return (
      <div style={s.wrap}>
        <EmptyState icon="Folder" title={t("tab.noRepo")} />
      </div>
    );
  }
  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  }

  const docs = data?.docs ?? [];
  const budget = data?.token_budget ?? 0;
  const byPath = new Map(docs.map((d) => [d.path, d]));

  const q = filter.trim().toLowerCase();
  const matches = (path: string) => !q || path.toLowerCase().includes(q);

  const attached = order.filter((p) => byPath.has(p) && matches(p));
  const available = docs.filter((d) => !order.includes(d.path) && matches(d.path));

  const total = attachedTokens(docs, order);
  const overBudget = total > budget;

  const onDrop = (targetPath: string) => {
    if (!dragPath || dragPath === targetPath) return;
    const next = order.filter((p) => p !== dragPath);
    next.splice(next.indexOf(targetPath), 0, dragPath);
    commit(next);
    setDragPath(null);
  };

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <h2 style={s.heading}>{t("tab.heading")}</h2>
        <Badge>{t("tab.count", { enabled: order.length, total: docs.length })}</Badge>
        <div style={{ flex: 1 }} />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("filter.placeholder")}
          aria-label={t("filter.ariaLabel")}
          style={s.filterInput}
        />
      </div>
      <p style={s.hint}>{t("tab.hint")}</p>

      {docs.length === 0 ? (
        <EmptyState icon="FileText" title={t("tab.empty")} />
      ) : (
        <>
          {attached.length > 0 && (
            <>
              <div style={s.sectionLabel}>{t("tab.linkedHeading")}</div>
              {attached.map((path) => (
                <div
                  key={path}
                  draggable
                  onDragStart={() => setDragPath(path)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(path)}
                  style={{ ...s.row, opacity: dragPath === path ? 0.5 : 1, cursor: "grab" }}
                >
                  <Icon.Menu size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <Checkbox checked onChange={() => commit(order.filter((p) => p !== path))} />
                  <DocRowLabel doc={byPath.get(path)!} tokensLabel={t("row.tokens", { tokens: (byPath.get(path)!.tokens).toLocaleString("en-US") })} />
                </div>
              ))}
            </>
          )}

          {available.length > 0 && (
            <>
              <div style={{ ...s.sectionLabel, marginTop: 18 }}>{t("tab.availableHeading")}</div>
              {available.map((doc) => (
                <div key={doc.path} style={{ ...s.row, cursor: "default" }}>
                  <span style={{ width: 15, flexShrink: 0 }} />
                  <Checkbox checked={false} onChange={() => commit([...order, doc.path])} />
                  <DocRowLabel doc={doc} tokensLabel={t("row.tokens", { tokens: doc.tokens.toLocaleString("en-US") })} />
                </div>
              ))}
            </>
          )}

          <div style={s.footer}>
            <span style={s.total}>{t("tab.total", { tokens: total.toLocaleString("en-US") })}</span>
            <span style={s.injectionLabel}>{t("tab.injectionLabel")}</span>
            <div style={{ flex: 1 }} />
            {!overBudget && <span style={s.budgetOk}>{t("tab.budget", { tokens: total.toLocaleString("en-US"), budget: budget.toLocaleString("en-US") })}</span>}
          </div>
          {overBudget && (
            <div role="alert" style={s.overBudget}>
              {t("tab.overBudget", { tokens: total.toLocaleString("en-US"), budget: budget.toLocaleString("en-US") })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DocRowLabel({ doc, tokensLabel }: { doc: ContextDoc; tokensLabel: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
      <span className="mono" style={s.rowPath}>
        {doc.path}
      </span>
      <div style={{ flex: 1 }} />
      <span style={s.rowTokens}>{tokensLabel}</span>
      <Badge>{doc.root}</Badge>
    </div>
  );
}
