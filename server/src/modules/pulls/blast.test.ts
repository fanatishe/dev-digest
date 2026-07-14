import { describe, it, expect } from 'vitest';
import { buildBlastRadius } from './blast.js';
import type { BlastResult } from '../repo-intel/types.js';

/**
 * `rateLimit` is declared in `src/middleware/ratelimit.ts`.
 *   · `src/api/public/index.ts` CALLS it            → a caller (1 symbol hop)
 *   · `src/server.ts` imports index.ts, which imports ratelimit.ts
 *                                                   → a DEPENDENT (2 import hops)
 * The endpoint on `server.ts` is only reachable via the import graph — the
 * caller list alone can never see it. That is the case the `dependentsByFile`
 * walk exists for, and the assertions below pin it.
 */
const RESULT: BlastResult = {
  changedSymbols: [
    { file: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function' },
    { file: 'src/middleware/ratelimit.ts', name: 'bucketKey', kind: 'function' },
  ],
  callers: [
    {
      file: 'src/api/public/index.ts',
      symbol: 'publicRouter',
      viaSymbol: 'rateLimit',
      line: 23,
      rank: 90,
    },
    {
      file: 'src/jobs/reset-buckets.ts',
      symbol: 'resetBuckets',
      viaSymbol: 'bucketKey',
      line: 8,
      rank: 40,
    },
  ],
  impactedEndpoints: [],
  factsByFile: {
    'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
    'src/jobs/reset-buckets.ts': { endpoints: [], crons: ['reset-rate-buckets (hourly)'] },
    'src/server.ts': { endpoints: ['GET /api/public/health'], crons: [] },
  },
  dependentsByFile: {
    'src/middleware/ratelimit.ts': ['src/api/public/index.ts', 'src/server.ts'],
  },
  degraded: false,
};

describe('buildBlastRadius', () => {
  it('groups callers under the changed symbol they reach', () => {
    const out = buildBlastRadius(RESULT);
    const byName = new Map(out.downstream.map((d) => [d.symbol, d]));

    expect(byName.get('rateLimit')!.callers).toEqual([
      { name: 'publicRouter', file: 'src/api/public/index.ts', line: 23 },
    ]);
    expect(byName.get('bucketKey')!.callers).toEqual([
      { name: 'resetBuckets', file: 'src/jobs/reset-buckets.ts', line: 8 },
    ]);
  });

  it('attributes an endpoint reachable only through the IMPORT GRAPH', () => {
    const out = buildBlastRadius(RESULT);
    const rateLimit = out.downstream.find((d) => d.symbol === 'rateLimit')!;

    // From the direct caller...
    expect(rateLimit.endpoints_affected).toContain('GET /api/public/items');
    // ...and from `src/server.ts`, which NOTHING in `callers` mentions. Without
    // the reverse-import walk this endpoint is invisible.
    expect(rateLimit.endpoints_affected).toContain('GET /api/public/health');
  });

  it('attributes crons the same way', () => {
    const out = buildBlastRadius(RESULT);
    const bucketKey = out.downstream.find((d) => d.symbol === 'bucketKey')!;
    expect(bucketKey.crons_affected).toEqual(['reset-rate-buckets (hourly)']);
  });

  it('keeps a changed symbol that has NO callers, rather than dropping it', () => {
    const out = buildBlastRadius({
      ...RESULT,
      callers: [],
      dependentsByFile: {},
    });
    expect(out.downstream.map((d) => d.symbol)).toEqual(['rateLimit', 'bucketKey']);
    expect(out.downstream.every((d) => d.callers.length === 0)).toBe(true);
    expect(out.summary).toBe('2 symbols changed, no downstream callers found.');
  });

  it('counts DISTINCT endpoints in the summary, not the per-symbol sum', () => {
    // Both symbols reach the same endpoint. That is ONE endpoint at risk.
    const shared: BlastResult = {
      ...RESULT,
      dependentsByFile: {
        'src/middleware/ratelimit.ts': ['src/api/public/index.ts', 'src/server.ts'],
      },
    };
    const out = buildBlastRadius(shared);
    const summed = out.downstream.reduce((n, d) => n + d.endpoints_affected.length, 0);
    expect(summed).toBeGreaterThan(2); // both symbols list the same endpoints
    expect(out.summary).toContain('2 endpoints'); // but only 2 are distinct
  });

  it('passes degraded/reason through — an unindexed repo is a badge, not an error', () => {
    const out = buildBlastRadius({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    });
    expect(out.degraded).toBe(true);
    expect(out.reason).toBe('no_data');
    expect(out.changed_symbols).toEqual([]);
    expect(out.summary).toBe('No indexed symbols in the changed files.');
  });

  it('does not crash when factsByFile / dependentsByFile are absent (ripgrep path)', () => {
    const out = buildBlastRadius({
      changedSymbols: [{ file: 'a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'b.ts', symbol: 'bar', viaSymbol: 'foo', line: 1, rank: 0 }],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    });
    expect(out.downstream[0]!.callers).toHaveLength(1);
    expect(out.downstream[0]!.endpoints_affected).toEqual([]);
  });
});
