import { describe, it, expect } from 'vitest';
import {
  resolveContextDocPaths,
  planContextInjection,
  type DocReadResult,
} from './helpers.js';

describe('resolveContextDocPaths (AC-12 — effective set: agent-first, skills in link order, dedup first-wins)', () => {
  it('lists the agent docs first, then each skill in order', () => {
    const out = resolveContextDocPaths(
      ['specs/a.md', 'docs/b.md'],
      [['docs/c.md'], ['insights/d.md']],
    );
    expect(out).toEqual(['specs/a.md', 'docs/b.md', 'docs/c.md', 'insights/d.md']);
  });

  it('dedups by full repo-relative path, keeping the FIRST occurrence position', () => {
    // `docs/b.md` is on the agent AND a skill; `docs/c.md` is on two skills.
    const out = resolveContextDocPaths(
      ['specs/a.md', 'docs/b.md'],
      [['docs/b.md', 'docs/c.md'], ['docs/c.md', 'insights/d.md']],
    );
    expect(out).toEqual(['specs/a.md', 'docs/b.md', 'docs/c.md', 'insights/d.md']);
  });

  it('treats null / absent lists as empty and preserves duplicate-free ordering', () => {
    expect(resolveContextDocPaths(null, [])).toEqual([]);
    expect(resolveContextDocPaths(undefined, [null, undefined, ['x.md']])).toEqual(['x.md']);
    // A doc appearing twice within one skill list collapses to its first slot.
    expect(resolveContextDocPaths([], [['x.md', 'y.md', 'x.md']])).toEqual(['x.md', 'y.md']);
  });

  it('reordering the agent list reorders the effective set (AC-8 injection half)', () => {
    const first = resolveContextDocPaths(['specs/a.md', 'docs/b.md'], []);
    const swapped = resolveContextDocPaths(['docs/b.md', 'specs/a.md'], []);
    expect(first).toEqual(['specs/a.md', 'docs/b.md']);
    expect(swapped).toEqual(['docs/b.md', 'specs/a.md']);
  });
});

describe('planContextInjection (AC-15 — whole-doc token budget, never truncate)', () => {
  const ok = (path: string, tokens: number, body = `body:${path}`): DocReadResult => ({
    path,
    status: 'ok',
    body,
    tokens,
  });

  it('accepts docs in order until the running total would cross the budget, then drops the rest WHOLE', () => {
    const { accepted, skipped } = planContextInjection(
      [ok('a.md', 40), ok('b.md', 40), ok('c.md', 40)],
      100,
    );
    // 40 + 40 = 80 ≤ 100 accepted; 80 + 40 = 120 > 100 → c dropped whole.
    expect(accepted).toEqual([
      { path: 'a.md', body: 'body:a.md' },
      { path: 'b.md', body: 'body:b.md' },
    ]);
    expect(skipped).toEqual([{ path: 'c.md', reason: 'over_budget' }]);
  });

  it('once the budget is hit, EVERY later ok doc is over_budget even if it would individually fit', () => {
    // b crosses; c is tiny and would fit under the remaining budget, but the
    // remainder is dropped whole (no back-filling) — cumulative cutoff.
    const { accepted, skipped } = planContextInjection(
      [ok('a.md', 60), ok('b.md', 60), ok('c.md', 1)],
      100,
    );
    expect(accepted).toEqual([{ path: 'a.md', body: 'body:a.md' }]);
    expect(skipped).toEqual([
      { path: 'b.md', reason: 'over_budget' },
      { path: 'c.md', reason: 'over_budget' },
    ]);
  });

  it('a lone doc larger than the whole budget injects NOTHING (never head-truncated)', () => {
    const { accepted, skipped } = planContextInjection([ok('huge.md', 5000)], 100);
    expect(accepted).toEqual([]);
    expect(skipped).toEqual([{ path: 'huge.md', reason: 'over_budget' }]);
  });

  it('a doc whose tokens exactly equal the remaining budget is accepted (strict >)', () => {
    const { accepted, skipped } = planContextInjection([ok('a.md', 100)], 100);
    expect(accepted).toEqual([{ path: 'a.md', body: 'body:a.md' }]);
    expect(skipped).toEqual([]);
  });

  it('records unsafe / not_found with their true reason regardless of budget position', () => {
    const { accepted, skipped } = planContextInjection(
      [
        { path: '../../etc/passwd', status: 'unsafe' },
        ok('a.md', 40),
        { path: 'gone.md', status: 'not_found' },
        ok('b.md', 40),
        ok('c.md', 40),
      ],
      100,
    );
    expect(accepted).toEqual([
      { path: 'a.md', body: 'body:a.md' },
      { path: 'b.md', body: 'body:b.md' },
    ]);
    // Encounter order; unsafe/not_found keep their reason, the ok remainder is over_budget.
    expect(skipped).toEqual([
      { path: '../../etc/passwd', reason: 'unsafe' },
      { path: 'gone.md', reason: 'not_found' },
      { path: 'c.md', reason: 'over_budget' },
    ]);
  });

  it('injects everything when nothing crosses the budget (no skips)', () => {
    const { accepted, skipped } = planContextInjection([ok('a.md', 10), ok('b.md', 10)], 100);
    expect(accepted.map((d) => d.path)).toEqual(['a.md', 'b.md']);
    expect(skipped).toEqual([]);
  });
});
