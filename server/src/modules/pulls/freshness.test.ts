import { describe, it, expect } from 'vitest';
import { shouldResyncClone } from './freshness.js';

describe('shouldResyncClone', () => {
  const INDEXED = new Date('2026-07-14T00:00:00Z');

  it('is stale when a PR was updated AFTER the last index', () => {
    expect(
      shouldResyncClone({
        indexUpdatedAt: INDEXED,
        indexDegraded: false,
        latestPrActivityAt: new Date('2026-07-15T00:00:00Z'),
      }),
    ).toBe(true);
  });

  it('is NOT stale when the index is newer than (or equal to) the latest PR activity', () => {
    expect(
      shouldResyncClone({
        indexUpdatedAt: INDEXED,
        indexDegraded: false,
        latestPrActivityAt: new Date('2026-07-13T00:00:00Z'),
      }),
    ).toBe(false);
    // Equal timestamps are not "newer" → no resync (strict >, so it self-terminates).
    expect(
      shouldResyncClone({
        indexUpdatedAt: INDEXED,
        indexDegraded: false,
        latestPrActivityAt: new Date(INDEXED),
      }),
    ).toBe(false);
  });

  it('never resyncs a degraded / never-built index (that needs a full index, not a resync)', () => {
    expect(
      shouldResyncClone({
        indexUpdatedAt: INDEXED,
        indexDegraded: true,
        latestPrActivityAt: new Date('2026-07-15T00:00:00Z'),
      }),
    ).toBe(false);
  });

  it('never resyncs on a guess — a missing timestamp on either side yields false', () => {
    expect(
      shouldResyncClone({
        indexUpdatedAt: null,
        indexDegraded: false,
        latestPrActivityAt: new Date('2026-07-15T00:00:00Z'),
      }),
    ).toBe(false);
    expect(
      shouldResyncClone({
        indexUpdatedAt: INDEXED,
        indexDegraded: false,
        latestPrActivityAt: null,
      }),
    ).toBe(false);
  });
});
