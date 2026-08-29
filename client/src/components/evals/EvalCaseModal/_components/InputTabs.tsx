/* InputTabs — the seeded PR context (Diff / Files / PR meta), populated read-only
   from usePullDetail (AC-1). All content is finding/PR-authored (untrusted), so it
   is rendered as text — the diff/files through the CodeEditor/`<pre>` (plain text
   nodes) and the PR meta through readOnly inputs — never dangerouslySetInnerHTML. */
"use client";

import { useTranslations } from "next-intl";
import { CodeEditor, Tabs, TextInput, Textarea } from "@devdigest/ui";
import type { IssueMeta, PrFile } from "@devdigest/shared";
import { s } from "../styles";

export type InputTabKey = "diff" | "files" | "prMeta";

export interface PrMetaView {
  title: string;
  body: string;
  linkedIssue: IssueMeta | null | undefined;
}

export function InputTabs({
  active,
  onTab,
  diffText,
  files,
  selectedFile,
  onSelectFile,
  meta,
}: {
  active: InputTabKey;
  onTab: (k: InputTabKey) => void;
  diffText: string;
  files: PrFile[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  meta: PrMetaView;
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
          (diffText ? (
            <CodeEditor value={diffText} rows={12} ariaLabel={t("caseModal.tabs.diff")} />
          ) : (
            <div style={s.empty}>{t("caseModal.diffEmpty")}</div>
          ))}

        {active === "files" &&
          (files.length === 0 ? (
            <div style={s.empty}>{t("caseModal.filesEmpty")}</div>
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
              <TextInput value={meta.title} readOnly />
            </label>
            <label>
              <div style={s.fieldLabel}>{t("caseModal.bodyLabel")}</div>
              <Textarea value={meta.body} rows={4} />
            </label>
            <label>
              <div style={s.fieldLabel}>{t("caseModal.linkedIssueLabel")}</div>
              <TextInput
                value={meta.linkedIssue ? `#${meta.linkedIssue.number} ${meta.linkedIssue.title}` : t("caseModal.noValue")}
                readOnly
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
