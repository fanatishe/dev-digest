/* IntentCard — what this PR is TRYING to do, derived from its metadata only
   (title / body / linked issue / branch / commits / changed-file list — never the
   diff bodies). PRESENTATIONAL: it takes the record and the callbacks as props;
   `OverviewTab` owns the hooks. Same container/presentational split as
   ConventionCandidateCard vs ConventionsWorkbench.

   The intent text is LLM-authored from untrusted, author-controlled PR text: it is
   rendered as plain text through JSX (which escapes) — never dangerouslySetInnerHTML —
   and `derived_from` entries are never turned into clickable links. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, EmptyState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { tokenSavings } from "./helpers";
import { s } from "./styles";

interface IntentCardProps {
  /** The stored intent — null when none has been derived for this PR yet. */
  intent: PrIntentRecord | null;
  /** The GET is in flight. */
  loading?: boolean;
  /** The recompute POST is in flight (a multi-second model call). */
  computing?: boolean;
  onRecompute: () => void;
}

export function IntentCard({ intent, loading, computing, onRecompute }: IntentCardProps) {
  const t = useTranslations("brief");

  // Derived during render — never mirrored into state (react-best-practices).
  const stale = intent?.is_stale === true;
  const risks = intent?.risk_areas ?? [];
  const sources = intent?.derived_from ?? [];
  const savings = tokenSavings(intent?.tokens_full, intent?.tokens_headers);

  const header = (
    <SectionLabel
      icon="Target"
      right={
        <div style={s.headerRight}>
          {stale && (
            <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)" style={{ cursor: "help" }}>
              <span title={t("intent.staleHint")}>{t("intent.stale")}</span>
            </Badge>
          )}
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={computing}
            aria-label={t("intent.recompute")}
            title={t("intent.recompute")}
            onClick={onRecompute}
          />
        </div>
      }
    >
      {t("block.intent")}
    </SectionLabel>
  );

  if (loading) {
    return (
      <Card>
        {header}
        <div style={s.skeletons}>
          <Skeleton height={16} />
          <Skeleton height={12} width="70%" />
          <Skeleton height={12} width="85%" />
        </div>
      </Card>
    );
  }

  if (!intent) {
    return (
      <Card>
        {header}
        <EmptyState icon="Target" title={t("intent.empty")} body={t("intent.emptyHint")} />
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <div style={s.body}>
        <p style={s.summary}>&ldquo;{intent.intent}&rdquo;</p>

        <div style={s.cols}>
          <section>
            <h3 style={s.colLabel("var(--ok)")}>
              <Icon.Check size={13} aria-hidden />
              {t("intent.inScope")}
            </h3>
            <ScopeList items={intent.in_scope} />
          </section>
          <section>
            <h3 style={s.colLabel("var(--text-muted)")}>
              <Icon.X size={13} aria-hidden />
              {t("intent.outOfScope")}
            </h3>
            <ScopeList items={intent.out_of_scope} />
          </section>
        </div>

        <section>
          <h3 style={s.colLabel("var(--text-muted)")}>
            <Icon.AlertTriangle size={13} aria-hidden />
            {t("intent.riskAreas")}
          </h3>
          {risks.length === 0 ? (
            <p style={s.muted}>{t("noRisks")}</p>
          ) : (
            <div style={s.chips}>
              {risks.map((risk, i) => (
                <Badge
                  key={`${i}-${risk}`}
                  icon="AlertTriangle"
                  color="var(--warn)"
                  bg="transparent"
                  style={{ border: "1px solid var(--border)", padding: "5px 10px" }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>{risk}</span>
                </Badge>
              ))}
            </div>
          )}
        </section>

        {(savings || sources.length > 0) && (
          <footer style={s.footer}>
            {savings && (
              <span className="tnum">
                {t("intent.tokens", {
                  full: savings.full,
                  headers: savings.headers,
                  pct: savings.pct,
                })}
              </span>
            )}
            {savings && sources.length > 0 && <span style={s.footerSep}>·</span>}
            {/* Provenance, not decoration: it says whether the machine read a real spec
                or inferred the intent from a branch name. Plain text — never a link. */}
            {sources.length > 0 && (
              <span>{t("intent.derivedFrom", { sources: sources.join(", ") })}</span>
            )}
          </footer>
        )}
      </div>
    </Card>
  );
}

function ScopeList({ items }: { items: string[] }) {
  return (
    <ul style={s.list}>
      {items.map((item, i) => (
        <li key={`${i}-${item}`} style={s.item}>
          <span style={s.bullet} aria-hidden>
            ·
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}
