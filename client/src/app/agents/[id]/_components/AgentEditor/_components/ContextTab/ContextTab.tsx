/* ContextTab (agent) — attach / detach / reorder the project-context documents
   linked to an agent. The checkbox is attachment membership; drag sets order (=
   the injection order of the `### <path>` chunks in the untrusted `## Project
   context` block at review time). Only PATH strings are persisted — never bodies.
   Footer shows a derived running token total + over-budget indicator (AC-10/AC-11). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn, Badge, Checkbox, Skeleton, EmptyState } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { useAgent } from "@/lib/hooks/agents";
import { useContextDocs, useSetAgentContextDocs } from "@/lib/hooks/context-docs";
import { attachedTokens, manifestGroups, splitPath, type ManifestGroup } from "./helpers";
import { DocPreviewDrawer } from "./_components/DocPreviewDrawer";
import { s } from "./styles";

export function ContextTab({ agentId, repoId }: { agentId: string; repoId: string | null }) {
  const t = useTranslations("projectContext");
  const { data: agent } = useAgent(agentId);
  const { data, isLoading } = useContextDocs(repoId);
  const setDocs = useSetAgentContextDocs(agentId);

  const attachedFromServer = React.useMemo(() => agent?.context_docs ?? [], [agent?.context_docs]);
  const [order, setOrder] = React.useState<string[]>(attachedFromServer);
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  // Preview drawer: the only new state is which doc's overview is open (a path).
  // Everything else (the doc, whether it's attached) is derived from `byPath`/`order`.
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  // Resync local order whenever the persisted set changes (post-mutation cache write).
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

  // Attached first (in saved order), then the rest — both narrowed by the filter.
  const attached = order.filter((p) => byPath.has(p) && matches(p));
  const available = docs.filter((d) => !order.includes(d.path) && matches(d.path));

  // Derived total + over-budget — never copied into state (AC-10, AC-11).
  const total = attachedTokens(docs, order);
  const overBudget = total > budget;

  const onDrop = (targetPath: string) => {
    if (!dragPath || dragPath === targetPath) return;
    const next = order.filter((p) => p !== dragPath);
    next.splice(next.indexOf(targetPath), 0, dragPath);
    commit(next);
    setDragPath(null);
  };

  const toggleAttached = (path: string) =>
    commit(order.includes(path) ? order.filter((p) => p !== path) : [...order, path]);

  // Derived: the doc whose preview drawer is open (never a copy of the row in state).
  const previewDoc = previewPath ? byPath.get(previewPath) : undefined;

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
                  <DocRowLabel doc={byPath.get(path)!} />
                  <IconBtn icon="Eye" label={t("row.previewAriaLabel", { name: path })} onClick={() => setPreviewPath(path)} />
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
                  <DocRowLabel doc={doc} />
                  <IconBtn icon="Eye" label={t("row.previewAriaLabel", { name: doc.path })} onClick={() => setPreviewPath(doc.path)} />
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

          <ManifestPanel groups={manifestGroups(docs, order)} />
        </>
      )}

      {previewDoc && (
        <DocPreviewDrawer
          doc={previewDoc}
          repoId={repoId}
          attached={order.includes(previewDoc.path)}
          onToggleAttached={() => toggleAttached(previewDoc.path)}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}

// Row label: bold filename + muted folder-path (design SoT, AC-16). The root Badge
// stays; the eye button and controls live in the parent row.
function DocRowLabel({ doc }: { doc: ContextDoc }) {
  const { name, dir } = splitPath(doc.path);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
      <span className="mono" style={s.rowName}>
        {name}
      </span>
      {dir && (
        <span className="mono" style={s.rowDir}>
          {dir}
        </span>
      )}
      <div style={{ flex: 1 }} />
      <Badge>{doc.root}</Badge>
    </div>
  );
}

// "Serializes as" manifest preview (AC-16): editor-only, display-only. Derived in
// render from the attached set — paths only, grouped by configured root, no bodies,
// persists nothing. Known roots get a friendly heading; unknown roots fall back to a
// generic one built from the root label.
function ManifestPanel({ groups }: { groups: ManifestGroup[] }) {
  const t = useTranslations("projectContext");
  const headingFor = (root: string) => {
    switch (root) {
      case "specs":
        return t("manifest.heading.specs");
      case "docs":
        return t("manifest.heading.docs");
      case "insights":
        return t("manifest.heading.insights");
      default:
        return t("manifest.headingFallback", { root });
    }
  };
  return (
    <div style={s.manifestSection}>
      <div style={s.manifestLabel}>{t("manifest.label")}</div>
      <div className="mono" style={s.manifestBlock}>
        {groups.length === 0 ? (
          <span style={s.manifestEmpty}>{t("manifest.empty")}</span>
        ) : (
          groups.map((group) => (
            <div key={group.root}>
              <div style={s.manifestHeading}>{t("manifest.headingLine", { heading: headingFor(group.root) })}</div>
              {group.paths.map((path) => (
                <div key={path} style={s.manifestPath}>
                  {t("manifest.pathLine", { path })}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
