"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, CodeEditor, Toggle, Button, Badge } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill, useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import { approxTokens } from "../../../SkillsWorkbench/helpers";
import { s } from "./styles";

const TYPES: SkillType[] = ["rubric", "convention", "security", "custom"];

/**
 * Config tab — the inline skill editor. Doubles as create (no `skill`, draft) and
 * edit (with `skill`). Saving a changed body creates a new version, optionally
 * labeled with the "what changed" message.
 */
export function ConfigTab({
  skill,
  onCreated,
  onCancel,
}: {
  skill?: Skill;
  onCreated?: (created: Skill) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const confirm = useConfirm();
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState(skill?.name ?? "");
  const [description, setDescription] = React.useState(skill?.description ?? "");
  const [type, setType] = React.useState<SkillType>(skill?.type ?? "custom");
  const [body, setBody] = React.useState(skill?.body ?? "");
  const [enabled, setEnabled] = React.useState(skill?.enabled ?? true);
  const [message, setMessage] = React.useState("");

  const isDraft = skill == null;
  const bodyChanged = (skill?.body ?? "") !== body;
  const dirty =
    isDraft ||
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    enabled !== skill.enabled ||
    bodyChanged;
  const busy = create.isPending || update.isPending;
  const typeOptions = TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));
  const fileName = `${(name || "skill").trim().replace(/\s+/g, "-")}.md`;

  const save = async () => {
    if (isDraft) {
      // Create: v1 has no "what changed" note — that field only appears on edits.
      const created = await create.mutateAsync({ name, description, type, body, enabled, source: "manual" });
      toast.success(t("config.createdToast", { name: created.name }));
      onCreated?.(created);
      return;
    }
    const updated = await update.mutateAsync({
      id: skill.id,
      patch: {
        name,
        description,
        type,
        body,
        enabled,
        ...(bodyChanged && message.trim() ? { message: message.trim() } : {}),
      },
    });
    setMessage("");
    toast.success(t("config.savedToast", { version: updated.version }));
  };

  const reset = () => {
    if (isDraft) {
      onCancel?.();
      return;
    }
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
    setMessage("");
  };

  const onDelete = async () => {
    if (isDraft) return;
    const ok = await confirm({
      title: t("config.deleteHeading"),
      message: t("config.deleteConfirm", { name: skill.name }),
      confirmLabel: t("config.delete"),
      danger: true,
    });
    if (!ok) return;
    await del.mutateAsync(skill.id);
    toast.success(t("config.deletedToast", { name: skill.name }));
    router.push("/skills");
  };

  // A save that creates a new immutable version: always on create (v1), and on
  // edit only when the body changed. Drives the "snapshots as vN" note.
  const willSnapshot = isDraft || bodyChanged;
  const nextVersion = isDraft ? 1 : skill.version + 1;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      <FormField label={t("config.nameLabel")} required>
        <TextInput value={name} onChange={setName} mono placeholder="pr-quality-rubric" />
      </FormField>
      <FormField label={t("config.descriptionLabel")} hint={t("config.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.typeLabel")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>

      <FormField label={t("config.bodyLabel")} required>
        <div style={s.editor}>
          <div style={s.editorBar}>
            <span className="mono" style={s.fileName}>
              {fileName}
            </span>
            {bodyChanged && <Badge color="var(--warn, #b58900)" style={{ background: "transparent", padding: 0 }}>{t("config.unsaved")}</Badge>}
            <div style={{ flex: 1 }} />
            <span style={s.tokens}>{t("config.tokens", { count: approxTokens(body) })}</span>
          </div>
          <CodeEditor value={body} onChange={setBody} rows={16} ariaLabel={t("config.bodyLabel")} />
        </div>
      </FormField>

      {/* "What changed" is only for edits (a new version); hidden on creation. */}
      {!isDraft && bodyChanged && (
        <FormField label={t("config.messageLabel")} hint={t("config.messageHint")}>
          <TextInput value={message} onChange={setMessage} placeholder={t("config.messagePlaceholder")} />
        </FormField>
      )}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={busy || !dirty || !name.trim() || !body.trim()}>
          {busy ? t("config.saving") : t("config.save")}
        </Button>
        {(isDraft ? onCancel : dirty) && (
          <Button kind="ghost" onClick={reset} disabled={busy}>
            {t("config.cancel")}
          </Button>
        )}
        {willSnapshot && (
          <span style={s.snapshotNote}>
            {t.rich("config.snapshotNote", {
              version: nextVersion,
              b: (chunks) => <strong style={{ color: "var(--text-secondary)" }}>{chunks}</strong>,
            })}
          </span>
        )}
      </div>

      {!isDraft && (
        <div style={s.dangerZone}>
          <div style={{ flex: 1 }}>
            <div style={s.dangerHeading}>{t("config.deleteHeading")}</div>
            <div style={s.dangerBody}>{t("config.deleteBody")}</div>
          </div>
          <Button kind="danger" icon="Trash" onClick={onDelete} disabled={del.isPending}>
            {t("config.delete")}
          </Button>
        </div>
      )}
    </div>
  );
}
