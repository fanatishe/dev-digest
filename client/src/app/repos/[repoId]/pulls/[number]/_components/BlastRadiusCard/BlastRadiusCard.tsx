/* BlastRadiusCard — "what could this change break?", the question the diff cannot answer.

   PRESENTATIONAL: it takes the records and the callbacks as props; `OverviewTab` owns
   the hooks. Same container/presentational split as IntentCard, its neighbour in the
   Overview grid.

   THE DEGRADED CASE IS THE IMPORTANT ONE. When the repo has no usable code index the
   server returns an EMPTY blast radius — which looks exactly like "nothing downstream
   is affected", the most dangerous thing this card could imply. So a degraded response
   renders a warning that says "unknown", not an empty card. It is never silently blank.

   Nothing here costs money: the whole card is a read of an index built once, at clone
   time. It is safe to render on every visit. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, EmptyState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { BlastRadius, PrHistoryItem } from "@devdigest/shared";
import { BlastTree } from "./_components/BlastTree/BlastTree";
import { BlastGraph } from "./_components/BlastGraph/BlastGraph";
import { PriorPrs } from "./_components/PriorPrs/PriorPrs";
import { KNOWN_DEGRADED_REASONS, VIEWS } from "./constants";
import { blastStats, degradedKey, type BlastView } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
  blast: BlastRadius | null;
  history: PrHistoryItem[];
  loading?: boolean;
  repoFullName: string | null;
  headSha: string | null;
  onOpenFile: (file: string) => void;
}

export function BlastRadiusCard({
  blast,
  history,
  loading,
  repoFullName,
  headSha,
  onOpenFile,
}: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const tb = useTranslations("brief");
  const [view, setView] = React.useState<BlastView>("tree");

  // Degraded is derived from the response, never mirrored into state.
  const degraded = blast?.degraded === true;

  const header = (
    <SectionLabel
      icon="Boxes"
      right={
        <div style={s.headerRight}>
          {degraded && (
            <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
              {t("degraded.badge")}
            </Badge>
          )}
          {blast && blast.changed_symbols.length > 0 && (
            <div style={s.toggle} role="group" aria-label={t("graph.ariaLabel")}>
              {VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  style={s.toggleBtn(view === v)}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {t(`view.${v}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      }
    >
      {tb("block.blast")}
    </SectionLabel>
  );

  if (loading) {
    return (
      <Card>
        {header}
        <div style={s.skeletons}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={12} />
          <Skeleton height={12} width="80%" />
        </div>
      </Card>
    );
  }

  if (!blast) {
    return (
      <Card>
        {header}
        <EmptyState icon="Boxes" title={tb("blast.empty")} />
      </Card>
    );
  }

  const stats = blastStats(blast);

  return (
    <Card>
      {header}

      {/* Says "unknown", never "nothing is affected". */}
      {degraded && (
        <div style={s.degraded} role="note">
          <Icon.AlertTriangle size={14} aria-hidden />
          <span>{t(`degraded.${degradedKey(blast.reason, KNOWN_DEGRADED_REASONS)}`)}</span>
        </div>
      )}

      <div style={s.stats} role="list">
        <Stat icon={<Icon.Code size={12} aria-hidden />} n={stats.symbols} label={t("stat.symbols")} />
        <Stat icon={<Icon.CornerDownRight size={12} aria-hidden />} n={stats.callers} label={t("stat.callers")} />
        <Stat icon={<Icon.Globe size={12} aria-hidden />} n={stats.endpoints} label={t("stat.endpoints")} />
        <Stat icon={<Icon.Clock size={12} aria-hidden />} n={stats.crons} label={t("stat.crons")} />
      </div>

      {stats.symbols === 0 ? (
        <p style={s.muted}>{blast.summary}</p>
      ) : view === "tree" ? (
        <BlastTree
          blast={blast}
          repoFullName={repoFullName}
          headSha={headSha}
          onOpenFile={onOpenFile}
        />
      ) : (
        <BlastGraph blast={blast} />
      )}

      <PriorPrs history={history} repoFullName={repoFullName} />
    </Card>
  );
}

/* `role="listitem"` + an explicit label so a screen reader announces "2 symbols" as one
   unit, rather than the number and the word as two unrelated fragments. */
function Stat({ icon, n, label }: { icon: React.ReactNode; n: number; label: string }) {
  return (
    <span style={s.stat} role="listitem" aria-label={`${n} ${label}`}>
      {icon}
      <span style={s.statNum} className="tnum" aria-hidden>
        {n}
      </span>
      <span aria-hidden>{label}</span>
    </span>
  );
}
