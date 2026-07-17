/* Pure presentational helpers for the RISK AREAS section. Nothing here touches React
   or the network — the component computes these DURING RENDER from the findings it is
   handed; none of it is ever mirrored into state. */
import type { FindingRecord } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Format a finding's line range for display ("12" single-line, else "12-18"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** `file:line` label for a finding, matching the Blast/Findings deep-link idiom. */
export function fileRef(f: Pick<FindingRecord, "file" | "start_line" | "end_line">): string {
  return `${f.file}:${lineLabel(f)}`;
}

// A finding's special `kind` wins over its `category` for iconography (a secret leak
// reads better as a lock than a generic bug). Both maps hold only OWN properties with
// icon names verified against the @devdigest/ui set.
const KIND_ICON = {
  secret_leak: "Lock",
  lethal_trifecta: "Shield",
} as const satisfies Record<string, IconName>;

const CATEGORY_ICON = {
  bug: "Bug",
  security: "Shield",
  perf: "Zap",
  style: "FileText",
  test: "FlaskConical",
} as const satisfies Record<string, IconName>;

/**
 * Icon for a finding — by `kind` first, then `category`. Both values arrive over the
 * wire, so every lookup is guarded to OWN properties (a `category` of `"constructor"`
 * would otherwise resolve up the prototype chain to a function).
 */
export function findingIcon(f: Pick<FindingRecord, "kind" | "category">): IconName {
  const kind = f.kind ?? "";
  if (Object.prototype.hasOwnProperty.call(KIND_ICON, kind)) {
    return KIND_ICON[kind as keyof typeof KIND_ICON];
  }
  if (Object.prototype.hasOwnProperty.call(CATEGORY_ICON, f.category)) {
    return CATEGORY_ICON[f.category as keyof typeof CATEGORY_ICON];
  }
  return "AlertTriangle";
}
