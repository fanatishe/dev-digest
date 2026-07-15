import { describe, it, expect } from 'vitest';
import { reachableDependents, type ImportEdge } from './blast-graph.js';

/**
 * `fromFile` imports `toFile`. So in this graph:
 *
 *   routes.ts → service.ts → util.ts        (routes imports service imports util)
 *
 * a change to `util.ts` blasts OUT to service.ts (1 hop) and routes.ts (2 hops).
 */
const CHAIN: ImportEdge[] = [
  { fromFile: 'routes.ts', toFile: 'service.ts' },
  { fromFile: 'service.ts', toFile: 'util.ts' },
];

describe('reachableDependents', () => {
  it('walks the graph BACKWARDS — dependents, not dependencies', () => {
    const out = reachableDependents(CHAIN, ['util.ts'], 2);
    // util.ts is imported BY service.ts, which is imported BY routes.ts.
    expect(out.get('util.ts')).toEqual(['service.ts', 'routes.ts']);
  });

  it('does NOT return the seed’s own dependencies', () => {
    // routes.ts imports service.ts. Changing routes.ts does not affect service.ts.
    expect(reachableDependents(CHAIN, ['routes.ts'], 2).get('routes.ts')).toEqual([]);
  });

  it('respects the depth bound', () => {
    // At depth 1, routes.ts (two hops out) must NOT appear.
    expect(reachableDependents(CHAIN, ['util.ts'], 1).get('util.ts')).toEqual(['service.ts']);
  });

  it('terminates on a cycle', () => {
    const cyclic: ImportEdge[] = [
      { fromFile: 'a.ts', toFile: 'b.ts' },
      { fromFile: 'b.ts', toFile: 'a.ts' },
    ];
    const out = reachableDependents(cyclic, ['a.ts'], 10);
    // b.ts depends on a.ts. The walk comes back to a.ts and stops: a seed is
    // never its own dependent.
    expect(out.get('a.ts')).toEqual(['b.ts']);
  });

  it('dedupes a file reachable by two paths', () => {
    const diamond: ImportEdge[] = [
      { fromFile: 'left.ts', toFile: 'core.ts' },
      { fromFile: 'right.ts', toFile: 'core.ts' },
      { fromFile: 'app.ts', toFile: 'left.ts' },
      { fromFile: 'app.ts', toFile: 'right.ts' },
    ];
    const found = reachableDependents(diamond, ['core.ts'], 2).get('core.ts')!;
    expect(found.filter((f) => f === 'app.ts')).toHaveLength(1);
    expect(new Set(found)).toEqual(new Set(['left.ts', 'right.ts', 'app.ts']));
  });

  it('keeps seeds independent of one another', () => {
    const out = reachableDependents(CHAIN, ['util.ts', 'service.ts'], 2);
    expect(out.get('util.ts')).toEqual(['service.ts', 'routes.ts']);
    expect(out.get('service.ts')).toEqual(['routes.ts']);
  });

  it('degrades to empty — never throws — with no edges or zero depth', () => {
    expect(reachableDependents([], ['a.ts'], 2).get('a.ts')).toEqual([]);
    expect(reachableDependents(CHAIN, ['util.ts'], 0).get('util.ts')).toEqual([]);
  });
});
