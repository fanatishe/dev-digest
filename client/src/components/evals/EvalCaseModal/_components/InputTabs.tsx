/* InputTabs — the case input, as Diff / Files / PR meta. ONE component serves both
   modes:
     - read-only (finding-derived): the seeded PR context from usePullDetail (AC-1).
     - editable (blank create + edit): the author edits the Diff textarea (the single
       source of truth) and the PR meta; the Files tab is a read-only projection of the
       diff (split per file) so there is nothing extra to keep in sync.

   All content is finding/PR/author-authored (untrusted), so it is rendered as text —
   the diff/files through CodeEditor/`<pre>` (plain text nodes) and the meta through
   inputs — never dangerouslySetInnerHTML. */
"use client";

import { useTranslations } from "next-intl";
import { CodeEditor, Tabs, TextInput, Textarea } from "@devdigest/ui";
import type { IssueMeta } from "@devdigest/shared";
import { s } from "../styles";

export type InputTabKey = "diff" | "files" | "prMeta";

/** A file to list in the Files tab — a PR file or a chunk parsed from the authored diff. */
export interface InputFile {
  path: string;
  patch: string | null;
}

export interface PrMetaView {
  title: string;
  body: string;
  linkedIssue: IssueMeta | null | undefined;
}

export function InputTabs({
  active,
  onTab,
  editable = false,
  diffText,
  onDiffChange,
  files,
  selectedFile,
  onSelectFile,
  meta,
  onMetaChange,
}: {
  active: InputTabKey;
  onTab: (k: InputTabKey) => void;
  editable?: boolean;
  diffText: string;
  onDiffChange?: (v: string) => void;
  files: InputFile[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  meta: PrMetaView;
  onMetaChange?: (patch: Partial<{ title: string; body: string }>) => void;
}) {
  const t = useTranslations("eval");
  const selected = files.find((f) => f.path === selectedFile) ?? files[0];

  return (
    <div>
      <Tabs
        pad="0"
        value={active}
        onChange={(k) => onTab(k as InputTabKey)}
        tabs={[
          { key: "diff", label: t("caseModal.tabs.diff") },
          { key: "files", label: t("caseModal.tabs.files") },
          { key: "prMeta", label: t("caseModal.tabs.prMeta") },
        ]}
      />

      <div style={{ marginTop: 12 }}>
        {active === "diff" &&
          (editable ? (
            <CodeEditor
              value={diffText}
              onChange={onDiffChange}
              rows={12}
              placeholder={t("caseModal.diffPlaceholder")}
              ariaLabel={t("caseModal.tabs.diff")}
            />
          ) : diffText ? (
            <CodeEditor value={diffText} rows={12} ariaLabel={t("caseModal.tabs.diff")} />
          ) : (
            <div style={s.empty}>{t("caseModal.diffEmpty")}</div>
          ))}

        {active === "files" &&
          (files.length === 0 ? (
            <div style={s.empty}>{editable ? t("caseModal.filesFromDiffEmpty") : t("caseModal.filesEmpty")}</div>
          ) : (
            <div style={s.filesLayout}>
              <div style={s.fileList} role="list">
                {files.map((f) => (
                  <button
                    key={f.path}
                    role="listitem"
                    type="button"
                    onClick={() => onSelectFile(f.path)}
                    title={f.path}
                    style={s.fileItem(selected?.path === f.path)}
                  >
                    {f.path}
                  </button>
                ))}
              </div>
              <pre className="mono" style={s.filePreview}>
                {selected?.patch ?? t("caseModal.diffEmpty")}
              </pre>
            </div>
          ))}

        {active === "prMeta" && (
          <div style={s.metaFields}>
            <label>
              <div style={s.fieldLabel}>{t("caseModal.titleLabel")}</div>
              <TextInput
                value={meta.title}
                readOnly={!editable}
                onChange={editable ? (v) => onMetaChange?.({ title: v }) : undefined}
              />
            </label>
            <label>
              <div style={s.fieldLabel}>{t("caseModal.bodyLabel")}</div>
              <Textarea
                value={meta.body}
                rows={4}
                onChange={editable ? (v) => onMetaChange?.({ body: v }) : undefined}
              />
            </label>
            {!editable && (
              <label>
                <div style={s.fieldLabel}>{t("caseModal.linkedIssueLabel")}</div>
                <TextInput
                  value={meta.linkedIssue ? `#${meta.linkedIssue.number} ${meta.linkedIssue.title}` : t("caseModal.noValue")}
                  readOnly
                />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
