/* RecentRunsTable — the per-agent detail run/batch table with checkbox selection.

   Owns its own selection state and the Compare affordance: Compare is enabled ONLY
   when EXACTLY two batches are selected (spec AC-23); any other count disables it.
   On Compare it hands the two batch ids (base, head) up to the detail view, which
   opens the CompareModal. Presentational otherwise — data comes from the parent. */
"use client";

import React from "react";
import { Checkbox, Button, Badge } from "@devdigest/ui";
import type { EvalBatch } from "@devdigest/shared";
import { pct, shortWhen, versionLabel, passSummary } from "../../helpers";
import { COPY } from "./constants";
import { s } from "./styles";

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
    if (canCompare) onCompare(selected[0]!, selected[1]!);
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
        <span>{COPY.col.version}</span>
        <span>{COPY.col.ranAt}</span>
        <span style={s.num}>{COPY.col.recall}</span>
        <span style={s.num}>{COPY.col.precision}</span>
        <span style={s.num}>{COPY.col.citation}</span>
        <span style={s.num}>{COPY.col.pass}</span>
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
              <Badge mono bg="transparent" style={s.versionBadge}>
                {versionLabel(b.agent_version)}
              </Badge>
              <span style={s.when}>{shortWhen(b.ran_at)}</span>
              <span style={s.num}>{pct(b.recall)}</span>
              <span style={s.num}>{pct(b.precision)}</span>
              <span style={s.num}>{pct(b.citation_accuracy)}</span>
              <span style={s.num}>{passSummary(b)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default RecentRunsTable;
