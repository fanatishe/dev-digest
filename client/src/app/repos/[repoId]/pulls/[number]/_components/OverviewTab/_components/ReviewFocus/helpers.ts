/* Pure presentational helpers for the REVIEW FOCUS section. Nothing here touches React
   or the network.

   NOTE: `lineLabel` / `fileRef` are intentionally duplicated from the sibling RISK AREAS
   feature's `helpers.ts`. The two live under different route `_components/` folders
   (OverviewTab vs IntentCard) and frontend-ui-architecture forbids importing across
   sibling features; the shared promotion target (`lib/` or the route root) is outside
   this folder. Trivial pure logic, so a colocated copy is the lesser evil. */
import type { FindingRecord } from "@devdigest/shared";

/** Format a finding's line range for display ("12" single-line, else "12-18"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** `file:line` label for a finding, matching the Blast/Findings deep-link idiom. */
export function fileRef(f: Pick<FindingRecord, "file" | "start_line" | "end_line">): string {
  return `${f.file}:${lineLabel(f)}`;
}
