/* RecentRunsTable — the per-agent detail run/batch table with checkbox selection.

   Owns its own selection state and the Compare affordance: Compare is enabled ONLY
   when EXACTLY two batches are selected (spec AC-23); any other count disables it.
   On Compare it hands the two batch ids (base, head) up to the detail view, which
   opens the CompareModal. Presentational otherwise — data comes from the parent. */
"use client";

import React from "react";
import { Checkbox, Button, Badge } from "@devdigest/ui";
import type { EvalBatch } from "@devdigest/shared";
import { shortWhen, versionLabel, passSummary, money } from "../../helpers";
import { METRICS } from "../../constants";
import { MetricBar } from "../MetricBar";
import { COPY } from "./constants";
import { s } from "./styles";

const COLOR: Record<"recall" | "precision" | "citation", string> = {
  recall: METRICS[0].color,
  precision: METRICS[1].color,
  citation: METRICS[2].color,
};

export function RecentRunsTable({
  batches,
  onCompare,
}: {
  batches: EvalBatch[];
  onCompare: (baseId: string, headId: string) => void;
}) {
  // Selection is insertion-ordered so [0]=base, [1]=head for Compare.
  const [selected, setSelected] = React.useState<string[]>([]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const canCompare = selected.length === 2;

  const compare = () => {
    if (!canCompare) return;
    // Compare always reads older → newer so the delta is chronological and Promote
    // (which targets `head`) promotes the HIGHER version. Selection order is not
    // meaningful, so order the two by (version, ran_at) ascending here.
    const [a, b] = selected
      .map((id) => batches.find((x) => x.id === id)!)
      .sort(
        (x, y) =>
          (x.agent_version ?? 0) - (y.agent_version ?? 0) ||
          Date.parse(x.ran_at) - Date.parse(y.ran_at),
      );
    onCompare(a!.id, b!.id);
  };

  if (batches.length === 0) {
    return <div style={s.empty}>{COPY.noRuns}</div>;
  }

  return (
    <div>
      <div style={s.toolbar}>
        <span style={s.selectedCount}>
          {COPY.selectedCount(selected.length)}
        </span>
        <Button
          kind="primary"
          size="sm"
          icon="GitMerge"
          disabled={!canCompare}
          onClick={compare}
          title={canCompare ? undefined : COPY.compareHint}
        >
          {COPY.compare}
        </Button>
      </div>

      <div style={s.headerRow} aria-hidden>
        <span />
        <span>{COPY.col.ranAt}</span>
        <span>{COPY.col.version}</span>
        <span>{COPY.col.recall}</span>
        <span>{COPY.col.precision}</span>
        <span>{COPY.col.citation}</span>
        <span style={s.num}>{COPY.col.pass}</span>
        <span style={s.num}>{COPY.col.cost}</span>
      </div>

      <ul style={s.list}>
        {batches.map((b) => {
          const isSelected = selected.includes(b.id);
          return (
            <li key={b.id} style={{ ...s.row, ...(isSelected ? s.rowSelected : null) }}>
              <Checkbox
                checked={isSelected}
                onChange={() => toggle(b.id)}
                label={
                  <span style={s.srOnly}>
                    {COPY.selectLabel(versionLabel(b.agent_version), shortWhen(b.ran_at))}
                  </span>
                }
              />
              <span style={s.when}>{shortWhen(b.ran_at)}</span>
              <Badge mono bg="transparent" style={s.versionBadge}>
                {versionLabel(b.agent_version)}
              </Badge>
              <MetricBar value={b.recall} color={COLOR.recall} title={`${COPY.col.recall} ${b.recall}`} />
              <MetricBar value={b.precision} color={COLOR.precision} title={`${COPY.col.precision} ${b.precision}`} />
              <MetricBar value={b.citation_accuracy} color={COLOR.citation} title={`${COPY.col.citation} ${b.citation_accuracy}`} />
              <span style={s.num} title={passSummary(b)}>
                {b.traces_passed}/{b.traces_total}
              </span>
              <span style={s.num}>{money(b.cost_usd)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default RecentRunsTable;
