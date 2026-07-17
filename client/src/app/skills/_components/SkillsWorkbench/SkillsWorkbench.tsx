/* SkillsWorkbench — the /skills master–detail screen: left card list + right
   tabbed editor. Shared by /skills (no selection → "select a skill") and
   /skills/[id] (selection → editor). Mirrors AgentDetailView. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkills, useSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { SkillEditor } from "../SkillEditor";
import { ImportDrawer } from "../ImportDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

type ImportTab = "file" | "url" | "community";
const VALID_TABS = ["config", "preview", "context", "evals", "stats", "versions"];

export function SkillsWorkbench({ id }: { id?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();

  const { data: skills, isLoading: listLoading, isError: listError, refetch } = useSkills();
  const { data: selected, isLoading: skillLoading } = useSkill(id ?? null);

  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importTab, setImportTab] = React.useState<ImportTab | null>(null);

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (next: string) => {
    if (!id) return;
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const list = filterSkills(skills ?? [], query);

  const openSkill = (skillId: string) => {
    setCreating(false);
    router.push(`/skills/${skillId}?tab=config`);
  };
  const onCreated = (created: Skill) => {
    setCreating(false);
    router.push(`/skills/${created.id}?tab=config`);
  };

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {importTab && <ImportDrawer initialTab={importTab} onClose={() => setImportTab(null)} />}
      <div style={s.shell}>
        {/* left: list */}
        <div style={s.left}>
          <div style={s.leftHeader}>
            <div style={s.titleRow}>
              <h1 style={s.title}>{t("page.heading")}</h1>
              <Dropdown
                width={230}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
                  { divider: true },
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImportTab("file") },
                  { label: t("page.menu.fromUrl"), icon: "Link", onClick: () => setImportTab("url") },
                  { label: t("page.menu.community"), icon: "Globe", onClick: () => setImportTab("community") },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.list}>
            {listLoading && <><Skeleton height={92} /><Skeleton height={92} /></>}
            {listError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {list.map((sk) => (
              <SkillCard key={sk.id} skill={sk} active={!creating && sk.id === id} onClick={() => openSkill(sk.id)} />
            ))}
          </div>
        </div>

        {/* right: editor / draft / empty */}
        {creating ? (
          <SkillEditor tab="config" onTab={setTab} onCreated={onCreated} onCancelDraft={() => setCreating(false)} />
        ) : id ? (
          skillLoading || !selected ? (
            <div style={{ flex: 1, padding: 28 }}>
              <Skeleton height={28} width={240} />
              <div style={{ height: 16 }} />
              <Skeleton height={200} />
            </div>
          ) : (
            <SkillEditor skill={selected} tab={tab} onTab={setTab} />
          )
        ) : (
          <div style={s.right}>
            <div style={s.empty}>
              {!listLoading && list.length === 0 ? (
                <EmptyState
                  icon="Sparkles"
                  title={t("page.empty.title")}
                  body={t("page.empty.body")}
                  cta={t("page.empty.cta")}
                  onCta={() => setImportTab("file")}
                />
              ) : (
                <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
