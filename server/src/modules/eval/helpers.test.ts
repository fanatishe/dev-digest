import { describe, it, expect } from 'vitest';
import { batchLabel, toEvalBatchDto } from './helpers.js';
import type { EvalBatchRow } from './repository.js';

function batchRow(over: Partial<EvalBatchRow> = {}): EvalBatchRow {
  return {
    id: 'b1',
    workspaceId: 'w1',
    ownerKind: 'agent',
    ownerId: 'a1',
    agentVersion: 3,
    ranAt: new Date('2026-08-31T00:00:00Z'),
    recall: 1,
    precision: 1,
    citationAccuracy: 1,
    passRate: 1,
    tracesPassed: 1,
    tracesTotal: 1,
    casesTotal: 1,
    costUsd: 0,
    durationMs: 100,
    ...over,
  } as EvalBatchRow;
}

describe('batchLabel', () => {
  it('shows the single case name for a 1-case batch (a per-row run)', () => {
    expect(batchLabel(batchRow({ casesTotal: 1 }), ['helper-case'])).toBe('helper-case');
  });

  it('shows "All (N)" for a multi-case batch (a run-all)', () => {
    expect(batchLabel(batchRow({ casesTotal: 4 }), ['a', 'b', 'c', 'd'])).toBe('All (4)');
  });

  it('falls back to "All (N)" if a 1-case batch has no resolvable name', () => {
    expect(batchLabel(batchRow({ casesTotal: 1 }), [])).toBe('All (1)');
  });
});

describe('toEvalBatchDto', () => {
  it('passes the label through and defaults to null', () => {
    expect(toEvalBatchDto(batchRow(), 'helper-case').label).toBe('helper-case');
    expect(toEvalBatchDto(batchRow()).label).toBeNull();
  });
});
