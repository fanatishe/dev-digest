"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Modal, Skeleton, ErrorState } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkillVersion, type SkillVersion } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import { lineDiff } from "./diff";
import { s } from "./styles";

/** Versions tab — history with per-version message + Diff (vs current) + Restore. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const confirm = useConfirm();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion(skill.id);
  const [diffFrom, setDiffFrom] = React.useState<SkillVersion | null>(null);

  if (isLoading) return <div style={s.wrap}><Skeleton height={64} /><Skeleton height={64} /></div>;
  if (isError || !versions) return <div style={s.wrap}><ErrorState body={t("versions.loadError")} onRetry={() => refetch()} /></div>;

  const onRestore = async (v: SkillVersion) => {
    const ok = await confirm({
      title: t("versions.restore"),
      message: `Restore v${v.version} as the current body? This creates a new version.`,
      confirmLabel: t("versions.restore"),
    });
    if (!ok) return;
    await restore.mutateAsync({ version: v.version });
    toast.success(t("versions.restoredToast", { version: v.version }));
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.heading")}</h2>
        <Badge>{t("versions.count", { count: versions.length })}</Badge>
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      {versions.map((v) => {
        const isCurrent = v.version === skill.version;
        return (
          <div key={v.version} style={s.row}>
            <span className="mono" style={s.vBadge}>v{v.version}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={s.message(!v.message)}>{v.message || t("versions.noMessage")}</div>
              <div style={s.date}>{new Date(v.created_at).toLocaleString()}</div>
            </div>
            {isCurrent ? (
              <Badge color="var(--ok)" dot>{t("versions.current")}</Badge>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <Button kind="ghost" size="sm" icon="Eye" onClick={() => setDiffFrom(v)}>
                  {t("versions.diff")}
                </Button>
                <Button kind="secondary" size="sm" icon="History" onClick={() => onRestore(v)} disabled={restore.isPending}>
                  {t("versions.restore")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {diffFrom && (
        <Modal
          width={760}
          title={t("versions.diffTitle", { from: diffFrom.version })}
          onClose={() => setDiffFrom(null)}
          footer={<Button kind="secondary" onClick={() => setDiffFrom(null)}>Close</Button>}
        >
          <DiffView oldText={diffFrom.body} newText={skill.body} emptyLabel={t("versions.diffEmpty")} />
        </Modal>
      )}
    </div>
  );
}

function DiffView({ oldText, newText, emptyLabel }: { oldText: string; newText: string; emptyLabel: string }) {
  const rows = lineDiff(oldText, newText);
  const hasChange = rows.some((r) => r.type !== "ctx");
  if (!hasChange) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{emptyLabel}</p>;
  return (
    <pre style={s.diff}>
      {rows.map((r, i) => (
        <div key={i} style={s.diffRow(r.type)}>
          <span style={s.diffGutter}>{r.type === "add" ? "+" : r.type === "del" ? "-" : " "}</span>
          {r.text || " "}
        </div>
      ))}
    </pre>
  );
}
