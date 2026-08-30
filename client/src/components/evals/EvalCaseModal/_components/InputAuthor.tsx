/* InputAuthor — the EDITABLE input surface for authoring an eval case from scratch
   (blank create) or editing one (skill cases, and any non-finding case). Unlike the
   read-only InputTabs (which displays a finding's seeded PR context), this lets the
   author describe the input by Before/After file content + PR meta; the modal turns
   the Before/After into a unified diff via `buildUnifiedDiff` on save.

   All content is plain text through CodeEditor/TextInput — never dangerouslySetInnerHTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CodeEditor, Tabs, TextInput, Textarea } from "@devdigest/ui";
import { buildUnifiedDiff } from "../diff";
import { s } from "../styles";

export interface AuthorState {
  file: string;
  /** "modified" → Before+After; "new" → After only (a newly-added file). */
  mode: "modified" | "new";
  before: string;
  after: string;
  title: string;
  body: string;
}

export function InputAuthor({
  value,
  onChange,
}: {
  value: AuthorState;
  onChange: (patch: Partial<AuthorState>) => void;
}) {
  const t = useTranslations("eval");
  const [tab, setTab] = React.useState<"code" | "prMeta">("code");
  const [showPreview, setShowPreview] = React.useState(false);

  const previewPatch = buildUnifiedDiff({
    file: value.file,
    before: value.before,
    after: value.after,
    newFile: value.mode === "new",
  });

  return (
    <div>
      <Tabs
        pad="0"
        value={tab}
        onChange={(k) => setTab(k as "code" | "prMeta")}
        tabs={[
          { key: "code", label: t("caseModal.tabs.code") },
          { key: "prMeta", label: t("caseModal.tabs.prMeta") },
        ]}
      />

      {tab === "code" ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <Tabs
            pad="0"
            value={value.mode}
            onChange={(k) => onChange({ mode: k as "modified" | "new" })}
            tabs={[
              { key: "modified", label: t("caseModal.tabs.modifiedFile") },
              { key: "new", label: t("caseModal.tabs.newFile") },
            ]}
          />

          <label>
            <div style={s.fieldLabel}>{t("caseModal.filePathLabel")}</div>
            <TextInput value={value.file} onChange={(v) => onChange({ file: v })} mono />
          </label>

          {value.mode === "modified" && (
            <div>
              <div style={s.fieldLabel}>{t("caseModal.before")}</div>
              <CodeEditor
                value={value.before}
                onChange={(v) => onChange({ before: v })}
                rows={6}
                ariaLabel={t("caseModal.before")}
              />
            </div>
          )}

          <div>
            <div style={s.fieldLabel}>{t("caseModal.after")}</div>
            <CodeEditor
              value={value.after}
              onChange={(v) => onChange({ after: v })}
              rows={6}
              ariaLabel={t("caseModal.after")}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            style={{
              alignSelf: "flex-start",
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 12.5,
              padding: 0,
            }}
          >
            {t("caseModal.previewDiff")}
          </button>
          {showPreview && <pre style={s.filePreview}>{previewPatch}</pre>}
        </div>
      ) : (
        <div style={{ ...s.metaFields, marginTop: 12 }}>
          <label>
            <div style={s.fieldLabel}>{t("caseModal.titleLabel")}</div>
            <TextInput value={value.title} onChange={(v) => onChange({ title: v })} />
          </label>
          <label>
            <div style={s.fieldLabel}>{t("caseModal.bodyLabel")}</div>
            <Textarea value={value.body} onChange={(v) => onChange({ body: v })} rows={4} />
          </label>
        </div>
      )}
    </div>
  );
}

export default InputAuthor;
