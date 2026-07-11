"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Drawer,
  Tabs,
  Button,
  FormField,
  TextInput,
  Textarea,
  SelectInput,
  Badge,
  Icon,
  EmptyState,
} from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import {
  useCreateSkill,
  useImportSkillPreview,
  type SkillPreview,
} from "@/lib/hooks/skills";
import { fileToImportInput } from "./helpers";
import { COMMUNITY_CATALOG, COMMUNITY_LANGS, type CommunityCatalogItem } from "./constants";

type Tab = "file" | "url" | "community";

/**
 * Import drawer — File / URL / Community. Imports are extract-only and go through
 * a PREVIEW before anything is saved; the saved skill is left disabled until the
 * user vets it. A foreign skill is foreign instructions in an agent's prompt.
 */
export function ImportDrawer({ initialTab = "file", onClose }: { initialTab?: Tab; onClose: () => void }) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<Tab>(initialTab);

  return (
    <Drawer width={720} title={t("drawer.title")} subtitle={t("drawer.subtitle")} onClose={onClose}>
      <div style={{ marginBottom: 18 }}>
        <Tabs
          pad="0"
          value={tab}
          onChange={(k) => setTab(k as Tab)}
          tabs={[
            { key: "file", label: t("drawer.tabs.file"), icon: "Upload" },
            { key: "url", label: t("drawer.tabs.url"), icon: "Link" },
            { key: "community", label: t("drawer.tabs.community"), icon: "Globe" },
          ]}
        />
      </div>
      {tab === "file" && <FileOrUrlTab kind="file" onClose={onClose} />}
      {tab === "url" && <FileOrUrlTab kind="url" onClose={onClose} />}
      {tab === "community" && <CommunityTab onClose={onClose} />}
    </Drawer>
  );
}

/** Shared File/URL flow: obtain an extract-only preview, then confirm to save. */
function FileOrUrlTab({ kind, onClose }: { kind: "file" | "url"; onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const previewMut = useImportSkillPreview();
  const create = useCreateSkill();
  const fileInput = React.useRef<HTMLInputElement>(null);

  const [url, setUrl] = React.useState("");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<SkillPreview | null>(null);
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");

  const applyPreview = (p: SkillPreview) => {
    setPreview(p);
    setName(p.name);
    setBody(p.body);
  };

  const runPreview = async (input: Parameters<typeof previewMut.mutateAsync>[0]) => {
    try {
      applyPreview(await previewMut.mutateAsync(input));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t("drawer.importFailed"));
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    await runPreview(await fileToImportInput(file));
  };

  const confirmSave = async () => {
    await create.mutateAsync({
      name,
      description: "",
      type: preview!.type,
      body,
      source: preview!.source,
      enabled: false, // untrusted → disabled until vetted
      evidence_files: preview!.evidence_files,
    });
    toast.success(t(kind === "url" ? "url.success" : "file.success", { name }));
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {kind === "file" ? (
        <FormField label={t("file.nameLabel")} hint={t("file.chooseHint")}>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.zip"
            style={{ display: "none" }}
            onChange={(e) => onPickFile(e.target.files?.[0])}
          />
          <Button kind="secondary" icon="Upload" onClick={() => fileInput.current?.click()}>
            {t("file.choose")}
          </Button>
          {fileName && <span style={{ marginLeft: 10, fontSize: 12.5, color: "var(--text-secondary)" }}>{t("file.selected", { name: fileName })}</span>}
        </FormField>
      ) : (
        <FormField label={t("url.label")} hint={t("url.hint")}>
          <div style={{ display: "flex", gap: 8 }}>
            <TextInput value={url} onChange={setUrl} placeholder={t("url.placeholder")} />
            <Button
              kind="secondary"
              icon="Link"
              onClick={() => runPreview({ kind: "url", url })}
              disabled={!url.trim() || previewMut.isPending}
            >
              {previewMut.isPending ? t("url.fetching") : t("url.import")}
            </Button>
          </div>
        </FormField>
      )}

      {preview && (
        <>
          <FormField label={t("file.nameLabel")} required>
            <TextInput value={name} onChange={setName} mono placeholder={t("file.namePlaceholder")} />
          </FormField>
          <div style={untrustedNote}>
            <Badge color="var(--warn, #b58900)" icon="AlertTriangle" style={{ background: "transparent", padding: 0 }}>
              {t("preview.untrustedBadge")}
            </Badge>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{t("file.bodyHint")}</span>
          </div>
          <FormField label={t("preview.bodyLabel")}>
            <Textarea value={body} onChange={setBody} rows={12} mono />
          </FormField>
          {preview.evidence_files && preview.evidence_files.length > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              <div style={{ marginBottom: 4 }}>{t("file.evidence")}</div>
              {preview.evidence_files.map((f) => (
                <div key={f} className="mono" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon.FileText size={12} /> {f}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              kind="primary"
              icon="Check"
              onClick={confirmSave}
              disabled={create.isPending || !name.trim() || !body.trim()}
            >
              {create.isPending ? t("file.importing") : t("file.import")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Community tab: filter a static catalog, import an entry (disabled until vetted). */
function CommunityTab({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [q, setQ] = React.useState("");
  const [lang, setLang] = React.useState<string>("any");

  const items = COMMUNITY_CATALOG.filter(
    (c) =>
      (lang === "any" || c.lang === lang) &&
      [c.name, c.desc].some((f) => f.toLowerCase().includes(q.trim().toLowerCase())),
  );

  const importItem = async (c: CommunityCatalogItem) => {
    await create.mutateAsync({
      name: c.name,
      description: c.desc,
      type: "custom",
      body: c.body,
      source: "community",
      enabled: false,
    });
    toast.success(t("url.success", { name: c.name }));
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <TextInput value={q} onChange={setQ} placeholder={t("community.searchPlaceholder")} />
        <SelectInput
          value={lang}
          onChange={setLang}
          options={COMMUNITY_LANGS.map((l) => ({ value: l, label: l === "any" ? t("community.allLanguages") : l }))}
        />
      </div>
      {items.length === 0 ? (
        <EmptyState icon="Globe" title={t("community.noMatch.title")} body={t("community.noMatch.body")} />
      ) : (
        items.map((c) => (
          <div key={c.name} style={communityRow}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                <Badge icon="Star">{c.stars}</Badge>
                <Badge>{c.lang}</Badge>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>{c.desc}</div>
            </div>
            <Button kind="secondary" size="sm" icon="Plus" onClick={() => importItem(c)} disabled={create.isPending}>
              {t("community.import")}
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

const untrustedNote: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const communityRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 14px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg-elevated)",
};
