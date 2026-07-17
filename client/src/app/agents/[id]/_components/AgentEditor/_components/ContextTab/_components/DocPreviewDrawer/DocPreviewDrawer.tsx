/* DocPreviewDrawer — the "eye" full-overview drawer for a project-context document
   in the agent Context tab (mirrors the skill copy; duplicated per-route so the two
   sibling ContextTabs never import sideways). Opened from a row's eye button.

   The header (file icon + full repo-relative path + close ×), the root badge,
   "Used by N agents" and token count all come from the ALREADY-FETCHED `ContextDoc`
   list row — only the body is lazily fetched via `useContextDocContent`. The Attached
   toggle calls back into the parent, which drives the SAME set-context-docs mutation
   the row checkbox uses (attachment state stays single-sourced in the tab).

   Security: `body` is UNTRUSTED author-controlled markdown, rendered through the safe
   `Markdown` primitive (react-markdown, HTML escaped — never `dangerouslySetInnerHTML`);
   the path/labels render as text nodes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Badge, Button, Markdown, Skeleton, Icon } from "@devdigest/ui";
import type { ContextDoc } from "@devdigest/shared";
import { useContextDocContent } from "@/lib/hooks/context-docs";
import { s } from "./styles";

export function DocPreviewDrawer({
  doc,
  repoId,
  attached,
  onToggleAttached,
  onClose,
}: {
  doc: ContextDoc;
  repoId: string | null;
  attached: boolean;
  onToggleAttached: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("projectContext");
  const { data, isLoading, isError } = useContextDocContent(repoId, doc.path);

  return (
    <Drawer
      width={560}
      onClose={onClose}
      title={
        <span style={s.title}>
          <Icon.FileText size={16} style={{ flexShrink: 0 }} />
          <span className="mono" style={s.titlePath}>
            {doc.path}
          </span>
        </span>
      }
    >
      <div style={s.metaRow}>
        <Badge>{doc.root}</Badge>
        <span>{t("row.usedByAgents", { count: doc.used_by_agents })}</span>
        <span>{t("row.tokens", { tokens: doc.tokens.toLocaleString("en-US") })}</span>
      </div>

      <div style={s.toggleRow}>
        <Button
          kind={attached ? "secondary" : "primary"}
          icon={attached ? "Check" : "Plus"}
          onClick={onToggleAttached}
          aria-pressed={attached}
        >
          {attached ? t("drawer.attached") : t("drawer.attach")}
        </Button>
      </div>

      <div style={s.body}>
        {isLoading ? (
          <div style={s.loadingWrap}>
            <Skeleton height={18} />
            <Skeleton height={18} />
            <Skeleton height={18} />
          </div>
        ) : isError ? (
          <p role="alert" style={s.note}>
            {t("drawer.loadError")}
          </p>
        ) : !data?.body ? (
          <p style={s.note}>{t("drawer.emptyBody")}</p>
        ) : (
          <Markdown>{data.body}</Markdown>
        )}
      </div>
    </Drawer>
  );
}
