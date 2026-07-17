/* PreviewPane — the right-hand detail pane of the two-pane Project Context screen
   (AC-6). Shows the selected document's filename, root badge and "Used by N agents",
   plus Preview / Edit tabs. The full markdown BODY is fetched lazily on selection via
   `useContextDocContent` (the discovery listing is paths-only — no body crosses it).

   Security: `body` is UNTRUSTED author-controlled markdown. Preview renders it through
   the safe `Markdown` primitive (react-markdown, no rehype-raw → HTML is escaped); Edit
   shows the RAW source in a read-only `CodeEditor` (no `onChange` → edits are ephemeral,
   never persisted — the spec's no-authoring Non-goal). Never `dangerouslySetInnerHTML`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, CodeEditor, Markdown, Skeleton, Tabs } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { useContextDocContent } from "@/lib/hooks/context-docs";
import { splitPath } from "../../helpers";
import { s } from "../../styles";

const TABS = [
  { key: "preview", labelKey: "preview.tabPreview", icon: "Eye" as const },
  { key: "edit", labelKey: "preview.tabEdit", icon: "Code" as const },
];

export function PreviewPane({ doc, repoId }: { doc: ContextDoc; repoId: string | null }) {
  const t = useTranslations("projectContext");
  const [mode, setMode] = React.useState<"preview" | "edit">("preview");
  const { data, isLoading, isError } = useContextDocContent(repoId, doc.path);
  const { name } = splitPath(doc.path);

  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  return (
    <div style={s.pane}>
      <div style={s.paneHeader}>
        <span style={s.paneTitleBlock}>
          <span className="mono" style={s.paneFilename}>
            {name}
          </span>
          {/* Full repo-relative path (AC-6) — folder-path subtitle mirroring the list
              row; author-controlled, rendered as a text node (never HTML). */}
          <span className="mono" style={s.panePath}>
            {doc.path}
          </span>
        </span>
        <Badge style={s.rowBadge}>{doc.root.toUpperCase()}</Badge>
        {/* Token count (AC-6) — from the already-fetched ContextDoc, same label the
            list row / Context tab use; a plain number rendered as text. */}
        <span style={s.paneTokens}>{t("row.tokens", { tokens: doc.tokens })}</span>
        <span style={s.paneUsedBy}>{t("row.usedByAgents", { count: doc.used_by_agents })}</span>
      </div>

      <div style={s.paneTabsBar}>
        <Tabs
          tabs={tabs}
          value={mode}
          onChange={(k) => setMode(k === "edit" ? "edit" : "preview")}
          pad="0 8px"
        />
      </div>

      <div style={s.paneBody}>
        {isLoading ? (
          <div style={s.loadingWrap}>
            <Skeleton height={18} />
            <Skeleton height={18} />
            <Skeleton height={18} />
          </div>
        ) : isError ? (
          <p role="alert" style={s.paneNote}>
            {t("preview.loadError")}
          </p>
        ) : !data?.body ? (
          <p style={s.paneNote}>{t("preview.emptyBody")}</p>
        ) : mode === "edit" ? (
          <>
            <p style={s.paneNote}>{t("preview.editNote")}</p>
            {/* Raw source, read-only: no onChange → keystrokes never mutate value. */}
            <CodeEditor value={data.body} ariaLabel={t("preview.editAriaLabel")} rows={20} />
          </>
        ) : (
          <Markdown>{data.body}</Markdown>
        )}
      </div>
    </div>
  );
}
