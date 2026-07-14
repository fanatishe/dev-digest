import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";

export type BlastView = "tree" | "graph";

export type DegradedReasonKey =
  | "no_data"
  | "flag_off"
  | "index_partial"
  | "index_failed"
  | "repo_too_large";

/** The four numbers in the card's stat row. */
export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/**
 * Endpoints and crons are counted DISTINCT across the whole PR, not summed per symbol.
 * Two changed symbols reaching the same endpoint is ONE endpoint at risk; summing would
 * double-count it and inflate the number the reviewer anchors on.
 *
 * Callers ARE summed: the same file calling two different changed symbols really is two
 * call sites to go and look at.
 */
export function blastStats(blast: BlastRadius): BlastStats {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;

  for (const d of blast.downstream) {
    callers += d.callers.length;
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }

  return {
    symbols: blast.changed_symbols.length,
    callers,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}

/**
 * Map the server's `reason` onto an i18n key. Unknown reasons degrade to `unknown`
 * rather than being rendered raw — `index_partial` is a token for us, not English for
 * the reader.
 */
export function degradedKey(
  reason: string | null | undefined,
  known: readonly string[],
): string {
  return reason && known.includes(reason) ? reason : "unknown";
}

/** The changed symbols that actually have somewhere to go — the graph's rows. */
export function graphableSymbols(blast: BlastRadius): DownstreamImpact[] {
  return blast.downstream.filter(
    (d) => d.callers.length > 0 || d.endpoints_affected.length > 0,
  );
}

/** `"src/api/public/index.ts"` → `"index.ts"`. Graph nodes have ~20 chars of room. */
export function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Trim to fit an SVG node without an ellipsis overflowing it. */
export function ellipsize(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}
