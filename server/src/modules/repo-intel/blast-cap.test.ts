import { describe, it, expect } from 'vitest';
import { capCallersPerSymbol } from './service.js';
import type { BlastCallerRow } from './types.js';

/**
 * REGRESSION. `tryPersistentBlast` used to cap callers with a flat
 * `callers.slice(0, MAX_CALLERS_PER_SYMBOL)` over the whole list. With several
 * changed symbols that keeps the globally-top-N rows and leaves some symbols
 * with NO callers at all — which the UI renders as "nothing downstream", a claim
 * a reviewer would act on. The cap must be per symbol.
 */
function callersFor(symbol: string, count: number, baseRank: number): BlastCallerRow[] {
  return Array.from({ length: count }, (_, i) => ({
    file: `caller-${symbol}-${i}.ts`,
    symbol: `fn${i}`,
    viaSymbol: symbol,
    line: i + 1,
    rank: baseRank - i, // descending within the symbol
  }));
}

describe('capCallersPerSymbol', () => {
  it('keeps callers for EVERY symbol — a global slice would starve some', () => {
    // 5 symbols × 10 callers = 50 rows, limit 20. Symbols are given decreasing
    // rank bands, so a global top-20 would keep only symbols A and B.
    const symbols = ['A', 'B', 'C', 'D', 'E'];
    const all = symbols.flatMap((s, i) => callersFor(s, 10, 1000 - i * 100));

    const globalSlice = [...all].sort((a, b) => b.rank - a.rank).slice(0, 20);
    expect(new Set(globalSlice.map((c) => c.viaSymbol))).toEqual(new Set(['A', 'B']));
    // ^ the old behaviour: C, D and E silently lose every caller.

    const capped = capCallersPerSymbol(all, 20);
    for (const s of symbols) {
      expect(capped.filter((c) => c.viaSymbol === s)).toHaveLength(10);
    }
    expect(capped).toHaveLength(50);
  });

  it('caps each symbol at the limit, keeping the highest-ranked', () => {
    const capped = capCallersPerSymbol(callersFor('A', 30, 500), 20);
    expect(capped).toHaveLength(20);
    // Highest rank first, and the 10 lowest-ranked callers are the ones dropped.
    expect(capped[0]!.rank).toBe(500);
    expect(Math.min(...capped.map((c) => c.rank))).toBe(481);
  });

  it('is a no-op below the limit, and safe on empty input', () => {
    expect(capCallersPerSymbol(callersFor('A', 3, 10), 20)).toHaveLength(3);
    expect(capCallersPerSymbol([], 20)).toEqual([]);
  });
});
