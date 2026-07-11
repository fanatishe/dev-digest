/* ConventionsWorkbench — the /conventions screen (Skills Lab → Conventions).
   Scans the active repo's clone for house-style conventions, lists the grounded
   candidates with accept/reject, and merges the accepted ones into a single skill
   via the Create-skill modal. Single-column (not master–detail like Skills). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import {
  useConventions,
  useExtractConventions,
  useAcceptConvention,
  useRejectConvention,
} from "@/lib/hooks/conventions";
import { ConventionCandidateCard } from "../ConventionCandidateCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { s } from "./styles";

export function ConventionsWorkbench() {
  const t = useTranslations("conventions");
  const toast = useToast();
  const { repoId, activeRepo } = useActiveRepo();
  const repoName = activeRepo?.name ?? t("page.repoFallback");

  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId ?? "");
  const accept = useAcceptConvention(repoId ?? "");
  const reject = useRejectConvention(repoId ?? "");

  const [modalOpen, setModalOpen] = React.useState(false);

  const list = candidates ?? [];
  const acceptedCount = list.filter((c) => c.accepted).length;
  const busy = accept.isPending || reject.isPending;

  const onRescan = async () => {
    try {
      await extract.mutateAsync();
    } catch {
      toast.error(t("page.extractionFailed"));
    }
  };

  const deselectAll = () => {
    for (const c of list) {
      if (c.accepted) accept.mutate({ id: c.id, accepted: false });
    }
  };

  const openModal = () => {
    if (acceptedCount === 0) {
      toast.info(t("modal.noneAccepted"));
      return;
    }
    setModalOpen(true);
  };

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.header}>
          <div style={s.headingBlock}>
            <h1 style={s.heading}>
              {t("page.headingPrefix")}
              <span style={s.repoName}>{repoName}</span>
            </h1>
            <div style={s.subtitle}>
              {list.length > 0 ? t("page.candidateCount", { count: list.length }) : t("page.subtitle")}
            </div>
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            onClick={onRescan}
            disabled={!repoId || extract.isPending}
          >
            {extract.isPending ? t("page.scanning") : t("page.rescan")}
          </Button>
        </div>

        {!repoId ? (
          <EmptyState icon="ListChecks" title={t("page.noRepo")} />
        ) : isLoading ? (
          <div style={s.list}>
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        ) : isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={onRescan}
          />
        ) : (
          <>
            <div style={s.toolbar}>
              <Button kind="ghost" size="sm" icon="X" onClick={deselectAll} disabled={acceptedCount === 0}>
                {t("page.deselectAll")}
              </Button>
              <span style={s.count}>
                {t("page.acceptedCount", { accepted: acceptedCount, total: list.length })}
              </span>
              <div style={{ flex: 1 }} />
              <Button kind="primary" icon="Sparkles" onClick={openModal} disabled={acceptedCount === 0}>
                {t("page.createSkill")}
              </Button>
            </div>

            <div style={s.list}>
              {list.map((c) => (
                <ConventionCandidateCard
                  key={c.id}
                  candidate={c}
                  pending={busy}
                  onAccept={(next) => accept.mutate({ id: c.id, accepted: next })}
                  onReject={() => reject.mutate(c.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {modalOpen && repoId && (
        <CreateSkillModal repoId={repoId} repoName={repoName} onClose={() => setModalOpen(false)} />
      )}
    </AppShell>
  );
}
