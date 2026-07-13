/* OverviewTab — the PR's "what is this change about" tab: the derived Intent card
   (left) beside the Blast-radius slot (right, not built yet), then the PR description.
   This is the container half of the split: it owns the data hooks; IntentCard is
   presentational. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { useComputeIntent, useIntent } from "@/lib/hooks/intent";
import { s } from "./styles";

interface OverviewTabProps {
  /** The PR row's uuid (resolved from the route's `number` by PrDetailView). */
  prId: string | null;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, prBody }: OverviewTabProps) {
  const t = useTranslations("brief");
  const { data: intent, isLoading } = useIntent(prId);
  const compute = useComputeIntent(prId);

  return (
    <>
      <div style={s.grid}>
        <IntentCard
          intent={intent ?? null}
          loading={isLoading}
          computing={compute.isPending}
          onRecompute={() => compute.mutate()}
        />
        {/* Blast radius is not built yet — the slot keeps the 2-col grid honest. */}
        <Card>
          <SectionLabel icon="Boxes">{t("block.blast")}</SectionLabel>
          <div style={s.placeholder}>{t("blast.empty")}</div>
        </Card>
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
