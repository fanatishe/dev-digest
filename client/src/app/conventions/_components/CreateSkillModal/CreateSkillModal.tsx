/* CreateSkillModal — "Create skill from conventions". Fetches the server-built
   draft (accepted rules merged into one `<repo>-conventions` skill body), lets the
   user edit name/description/type/enabled/body, then creates it via the existing
   /skills route and redirects to the new skill's Config tab. Nothing is persisted
   until the user clicks Create. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Modal,
  FormField,
  TextInput,
  SelectInput,
  Textarea,
  CodeEditor,
  Toggle,
  Button,
  Skeleton,
  ErrorState,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useConventionSkillDraft } from "@/lib/hooks/conventions";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

const TYPES: SkillType[] = ["rubric", "convention", "security", "custom"];
const TYPE_LABELS: Record<SkillType, string> = {
  rubric: "Rubric",
  convention: "Convention",
  security: "Security",
  custom: "Custom",
};

const approxTokens = (body: string) => Math.max(1, Math.ceil(body.length / 4));

export function CreateSkillModal({
  repoId,
  repoName,
  onClose,
}: {
  repoId: string;
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const toast = useToast();
  const { data: draft, isLoading, isError } = useConventionSkillDraft(repoId, true);
  const create = useCreateSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");
  const [ready, setReady] = React.useState(false);

  // Initialize the editable form once from the server draft.
  React.useEffect(() => {
    if (!draft || ready) return;
    setName(draft.name);
    setDescription(draft.description);
    setType(draft.type);
    setBody(draft.body);
    setReady(true);
  }, [draft, ready]);

  const onCreate = async () => {
    const created = await create.mutateAsync({
      name,
      description,
      type,
      body,
      enabled,
      source: "extracted",
    });
    toast.success(t("modal.createdToast", { name: created.name }));
    onClose();
    router.push(`/skills/${created.id}?tab=config`);
  };

  const canCreate = ready && !!name.trim() && !!body.trim() && !create.isPending;

  return (
    <Modal
      width={720}
      title={t("modal.title")}
      subtitle={name || draft?.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.savedNote}>{t("modal.savedNote")}</span>
          <div style={{ flex: 1 }} />
          <Button kind="ghost" onClick={onClose} disabled={create.isPending}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={onCreate} disabled={!canCreate}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {isLoading && (
          <>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={200} />
          </>
        )}
        {isError && <ErrorState body={t("modal.loadError")} />}
        {ready && draft && (
          <>
            <div style={s.banner}>
              {t("modal.banner", { count: draft.merged_count, repo: repoName })}
            </div>

            <FormField label={t("modal.nameLabel")} required>
              <TextInput value={name} onChange={setName} mono />
            </FormField>
            <FormField label={t("modal.descriptionLabel")}>
              <Textarea value={description} onChange={setDescription} rows={2} />
            </FormField>

            <div style={s.row}>
              <FormField label={t("modal.typeLabel")}>
                <SelectInput
                  value={type}
                  onChange={(v) => setType(v as SkillType)}
                  options={TYPES.map((v) => ({ value: v, label: TYPE_LABELS[v] }))}
                />
              </FormField>
              <label style={s.enabledLabel}>
                <span>{t("modal.enabledLabel")}</span>
                <Toggle on={enabled} onChange={setEnabled} size={16} />
                <span style={s.enabledHint}>{t("modal.enabledHint")}</span>
              </label>
            </div>

            <FormField label={t("modal.bodyLabel")} required>
              <div style={s.editor}>
                <div style={s.editorBar}>
                  <span className="mono" style={s.fileName}>
                    {(name || "skill").trim().replace(/\s+/g, "-")}.md
                  </span>
                  <div style={{ flex: 1 }} />
                  <span style={s.tokens}>{t("modal.tokens", { count: approxTokens(body) })}</span>
                </div>
                <CodeEditor value={body} onChange={setBody} rows={14} ariaLabel={t("modal.bodyLabel")} />
              </div>
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
