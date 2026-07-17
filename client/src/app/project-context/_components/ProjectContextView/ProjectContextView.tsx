/* ProjectContextView — the /project-context screen (two-pane master–detail, AC-6).
   LEFT (master): every `.md` discovered under the active repo's configured roots —
   file icon · bold filename · folder-path subtitle · uppercase configured-root badge
   (`doc.root`, NOT a top-level-area label) — with a client-side substring filter
   (derived, no refetch — AC-5) and an explicit empty state for an uncloned repo (AC-2).
   RIGHT (detail): the selected doc's Preview (rendered markdown body) / Edit (raw
   source, read-only) — the body is fetched lazily on selection. Read-only screen:
   attachment happens in the agent/skill Context tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Badge, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextDocs } from "@/lib/hooks/context-docs";
import { PreviewPane } from "./_components/PreviewPane";
import { filterDocs, splitPath } from "./helpers";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("projectContext");
  const { repoId } = useActiveRepo();
  const { data, isLoading, isError, refetch } = useContextDocs(repoId);

  // Filter + selected-path are the only local state; the visible list and the
  // selected doc's metadata are DERIVED in render from the already-fetched list,
  // never copied into a second state (AC-5). Only the body is a lazy query.
  const [filter, setFilter] = React.useState("");
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  const docs = data?.docs ?? [];
  const visible = filterDocs(docs, filter);
  const selected = docs.find((d) => d.path === selectedPath) ?? null;

  return (
    <AppShell>
      <div style={s.page}>
        <header style={s.header}>
          <h1 style={s.title}>{t("page.title")}</h1>
          <p style={s.subtitle}>{t("page.subtitle")}</p>
        </header>

        {!repoId ? (
          <EmptyState icon="Folder" title={t("noRepo.title")} body={t("noRepo.body")} />
        ) : isLoading ? (
          <div style={s.loadingWrap}>
            <Skeleton height={46} />
            <Skeleton height={46} />
            <Skeleton height={46} />
          </div>
        ) : isError ? (
          <ErrorState title={t("error.title")} body={t("error.body")} onRetry={() => void refetch()} />
        ) : docs.length === 0 ? (
          <EmptyState icon="FileText" title={t("empty.title")} body={t("empty.body")} />
        ) : (
          <div style={s.twoPane}>
            <div style={s.master}>
              <div style={s.toolbar}>
                <span style={s.count}>{t("page.count", { count: docs.length })}</span>
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t("filter.placeholder")}
                  aria-label={t("filter.ariaLabel")}
                  style={s.filterInput}
                />
              </div>
              <div style={s.list}>
                {visible.map((d) => (
                  <DocRow
                    key={d.path}
                    doc={d}
                    selected={d.path === selectedPath}
                    onSelect={() => setSelectedPath(d.path)}
                  />
                ))}
              </div>
            </div>

            {selected ? (
              <PreviewPane key={selected.path} doc={selected} repoId={repoId} />
            ) : (
              <div style={s.pane}>
                <div style={s.panePlaceholder}>{t("preview.placeholder")}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function DocRow({ doc, selected, onSelect }: { doc: ContextDoc; selected: boolean; onSelect: () => void }) {
  const { name, dir } = splitPath(doc.path);
  return (
    <button
      type="button"
      aria-pressed={selected}
      style={selected ? { ...s.row, ...s.rowSelected } : s.row}
      onClick={onSelect}
    >
      <Icon.FileText size={16} style={s.rowIcon} />
      <span style={s.rowText}>
        <span className="mono" style={s.rowName}>
          {name}
        </span>
        {dir && (
          <span className="mono" style={s.rowDir}>
            {dir}
          </span>
        )}
      </span>
      <Badge style={s.rowBadge}>{doc.root.toUpperCase()}</Badge>
    </button>
  );
}
