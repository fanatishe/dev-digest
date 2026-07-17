/* OverviewTab — the PR's "what is this change about" tab: the derived Intent card
   (left) beside the Blast-radius card (right), then the PR description. This is the
   container half of the split: it owns the data hooks; both cards are presentational.

   Note the cost asymmetry between the two. Intent is a MODEL call, and is only ever
   computed on demand. Blast radius is a read of the index built at clone time — free
   and fast — so it is fetched automatically on every visit. */
"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { ReviewFocus } from "./_components/ReviewFocus";
import { useComputeIntent, useIntent } from "@/lib/hooks/intent";
import { useBlastRadius, usePrHistory } from "@/lib/hooks/blast";
import { usePrReviews } from "@/lib/hooks/reviews";
import { focusFindings, orderedRiskFindings } from "./helpers";
import { s } from "./styles";

interface OverviewTabProps {
  /** The PR row's uuid (resolved from the route's `number` by PrDetailView). */
  prId: string | null;
  prBody: string | null | undefined;
  /** `owner/name` — for the blast card's GitHub deep links. */
  repoFullName: string | null;
  /** The PR's head sha — pins those links' line numbers to the code we indexed. */
  headSha: string | null;
  /** Reveal a CHANGED file in the Files-changed tab. */
  onOpenFile: (file: string) => void;
}

export function OverviewTab({
  prId,
  prBody,
  repoFullName,
  headSha,
  onOpenFile,
}: OverviewTabProps) {
  const { data: intent, isLoading } = useIntent(prId);
  const compute = useComputeIntent(prId);

  const { data: blast, isLoading: blastLoading } = useBlastRadius(prId);
  // History degrades independently of the blast radius: a repo whose clone is gone
  // still has an index to read, and an empty prior-PR list is not an error.
  const { data: history } = usePrHistory(prId);

  // Risk Areas + Review Focus are two lenses on the SAME already-computed data: the
  // latest review's findings. No model call is spent to show them — a plain read of the
  // persisted reviews, ordered deterministically.
  const { data: reviews } = usePrReviews(prId);
  const riskFindings = React.useMemo(() => orderedRiskFindings(reviews), [reviews]);
  const focus = React.useMemo(() => focusFindings(riskFindings), [riskFindings]);

  return (
    <>
      <div style={s.grid}>
        <IntentCard
          intent={intent ?? null}
          loading={isLoading}
          computing={compute.isPending}
          onRecompute={() => compute.mutate()}
          findings={riskFindings}
          onOpenFile={onOpenFile}
        />
        <BlastRadiusCard
          blast={blast ?? null}
          history={history?.history ?? []}
          loading={blastLoading}
          repoFullName={repoFullName}
          headSha={headSha}
          onOpenFile={onOpenFile}
        />
      </div>

      <ReviewFocus findings={focus} onOpenFile={onOpenFile} />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
