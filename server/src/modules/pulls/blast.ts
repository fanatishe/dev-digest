import type { BlastCaller, BlastRadius, ChangedSymbol, DownstreamImpact } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

/**
 * Blast Radius — the pure mapper. NO LLM, NO I/O, NO container, NO Drizzle, NO
 * Fastify. It takes the facade's `BlastResult` and returns the `BlastRadius`
 * contract shape (the domain ring; unit-testable with no DB).
 *
 * There are ZERO model calls in this feature. Every fact here was computed once,
 * at clone time, by the repo-intel indexer: symbols, resolved references, the
 * import graph, file rank, and the per-file endpoint/cron facts. This file only
 * RESHAPES them — flat rows in, grouped-by-symbol out.
 *
 * The two shapes disagree on purpose:
 *   · `BlastResult` is flat — `callers[]` each tagged with the `viaSymbol` they
 *     reach, plus side tables (`factsByFile`, `dependentsByFile`).
 *   · `BlastRadius` is what the reviewer reads — one entry per changed symbol,
 *     carrying its own callers and the endpoints/crons IT puts at risk.
 * Doing that attribution is this file's whole job.
 */

/** Endpoints/crons a changed symbol can reach, via two independent routes. */
function impactFor(
  symbolFile: string,
  callerFiles: readonly string[],
  result: BlastResult,
): { endpoints: string[]; crons: string[] } {
  const factsByFile = result.factsByFile ?? {};
  const endpoints = new Set<string>();
  const crons = new Set<string>();

  // Two hops, unioned, because either one alone is a lie:
  //   1. CALLER files — code that names this symbol directly. Precise, but only
  //      ever one hop: an endpoint that calls a function that calls ours is out
  //      of reach.
  //   2. DEPENDENT files — everything within BFS_DEPTH reverse import-hops of the
  //      file the symbol lives in. Coarser (file-level, not symbol-level), but it
  //      is what catches the endpoint two imports downstream.
  const reachable = new Set<string>([
    ...callerFiles,
    ...(result.dependentsByFile?.[symbolFile] ?? []),
  ]);

  for (const file of reachable) {
    const facts = factsByFile[file];
    if (!facts) continue;
    for (const e of facts.endpoints) endpoints.add(e);
    for (const c of facts.crons) crons.add(c);
  }
  return { endpoints: [...endpoints], crons: [...crons] };
}

/**
 * Compose the one-line summary the card shows above the tree. Deliberately
 * counts DISTINCT endpoints/crons across the whole PR, not the sum of the
 * per-symbol lists — two symbols reaching the same endpoint is one endpoint at
 * risk, and summing would double-count it.
 */
function summarize(
  changed: readonly ChangedSymbol[],
  downstream: readonly DownstreamImpact[],
): string {
  if (changed.length === 0) return 'No indexed symbols in the changed files.';

  const callers = downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpoints = new Set(downstream.flatMap((d) => d.endpoints_affected));
  const crons = new Set(downstream.flatMap((d) => d.crons_affected));

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const parts = [plural(changed.length, 'symbol'), plural(callers, 'caller')];
  if (endpoints.size > 0) parts.push(plural(endpoints.size, 'endpoint'));
  if (crons.size > 0) parts.push(`${crons.size} cron/job${crons.size === 1 ? '' : 's'}`);

  if (callers === 0) {
    return `${plural(changed.length, 'symbol')} changed, no downstream callers found.`;
  }
  return parts.join(' · ');
}

/**
 * `BlastResult` → the `BlastRadius` contract.
 *
 * `degraded`/`reason` are passed STRAIGHT THROUGH rather than being turned into
 * an error: an unindexed repo is a card with a badge, never a 500 and never a
 * blank panel that reads as "nothing is affected".
 */
export function buildBlastRadius(result: BlastResult): BlastRadius {
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // Callers arrive flat, tagged with the symbol they reach. The facade has
  // already ranked and capped them PER SYMBOL, so preserve its order — do not
  // re-sort, or the cap it applied stops matching what we show.
  const callersBySymbol = new Map<string, BlastCaller[]>();
  const callerFilesBySymbol = new Map<string, string[]>();
  for (const c of result.callers) {
    const caller: BlastCaller = { name: c.symbol, file: c.file, line: c.line };
    const arr = callersBySymbol.get(c.viaSymbol);
    if (arr) arr.push(caller);
    else callersBySymbol.set(c.viaSymbol, [caller]);

    const files = callerFilesBySymbol.get(c.viaSymbol);
    if (files) files.push(c.file);
    else callerFilesBySymbol.set(c.viaSymbol, [c.file]);
  }

  // One entry per CHANGED SYMBOL — including symbols with no callers at all.
  // Dropping those would quietly hide the safest part of the change, and after
  // the per-symbol cap fix "no callers" is a real finding rather than an
  // artifact of a global slice.
  const downstream: DownstreamImpact[] = changed_symbols.map((sym) => {
    const callerFiles = callerFilesBySymbol.get(sym.name) ?? [];
    const { endpoints, crons } = impactFor(sym.file, callerFiles, result);
    return {
      symbol: sym.name,
      callers: callersBySymbol.get(sym.name) ?? [],
      endpoints_affected: endpoints,
      crons_affected: crons,
    };
  });

  return {
    changed_symbols,
    downstream,
    summary: summarize(changed_symbols, downstream),
    degraded: result.degraded ?? false,
    reason: result.reason ?? null,
  };
}
