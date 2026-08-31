/* EvalCasesList — presentational list of eval cases for one owner. It maps rows to
   `EvalCaseRow`; all per-row data (last run, repro) rides on `EvalCaseWithRuns`, so
   rows render without N extra fetches. No data-fetching here (that lives in the
   panel's WP-D hooks). */
"use client";

import React from "react";
import type { EvalCaseWithRuns } from "@devdigest/shared";
import { EvalCaseRow } from "@/components/evals/EvalCaseRow";

export function EvalCasesList({
  cases,
  onEdit,
  runningId = null,
}: {
  cases: readonly EvalCaseWithRuns[];
  onEdit?: (evalCase: EvalCaseWithRuns) => void;
  /** The case currently being run by the panel's "Run all evals" sweep, if any. */
  runningId?: string | null;
}) {
  return (
    <ul
      style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}
    >
      {cases.map((c) => (
        <EvalCaseRow key={c.id} evalCase={c} onEdit={onEdit} running={c.id === runningId} />
      ))}
    </ul>
  );
}

export default EvalCasesList;
