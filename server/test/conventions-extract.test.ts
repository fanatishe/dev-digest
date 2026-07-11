import { describe, it, expect } from 'vitest';
import {
  verifyEvidence,
  renderSkillBody,
  slugify,
  clamp01,
  type RawCandidate,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/modules/conventions/repository.js';

/**
 * Evidence verification is the extractor's grounding gate: a candidate survives
 * ONLY when its cited file+line resolve to a real, non-blank source line. These
 * tests pin that discard behaviour (the AC: "candidates lacking valid evidence
 * must be discarded") without a DB/LLM.
 */

const file = 'src/api/users.ts';
const content = ['const a = 1;', 'async function f() {', '  return await db.find();', '}', ''].join('\n');
const byPath = new Map([[file, content]]);

function raw(over: Partial<RawCandidate> = {}): RawCandidate {
  return {
    category: 'error-handling',
    rule: 'Always await db calls',
    evidence: { file, line: 3 },
    confidence: 0.9,
    ...over,
  };
}

describe('verifyEvidence', () => {
  it('keeps a candidate whose file+line resolve to a real line', () => {
    const v = verifyEvidence(raw(), byPath);
    expect(v).not.toBeNull();
    expect(v!.rule).toBe('Always await db calls');
    // Snippet starts at the cited line and captures a small window.
    expect(v!.evidenceSnippet).toContain('return await db.find();');
    expect(v!.evidencePath).toBe('src/api/users.ts:3-5');
    expect(v!.confidence).toBe(0.9);
  });

  it('discards a candidate citing a file that was not sampled', () => {
    expect(verifyEvidence(raw({ evidence: { file: 'nope.ts', line: 1 } }), byPath)).toBeNull();
  });

  it('discards a candidate whose line is past the end of the file', () => {
    expect(verifyEvidence(raw({ evidence: { file, line: 999 } }), byPath)).toBeNull();
  });

  it('discards a candidate citing a non-positive or non-integer line', () => {
    expect(verifyEvidence(raw({ evidence: { file, line: 0 } }), byPath)).toBeNull();
    expect(verifyEvidence(raw({ evidence: { file, line: 2.5 } }), byPath)).toBeNull();
  });

  it('discards a candidate pointing at a blank line', () => {
    // line 5 exists (trailing empty string) but is blank → weak evidence, dropped.
    expect(verifyEvidence(raw({ evidence: { file, line: 5 } }), byPath)).toBeNull();
  });

  it('discards a candidate with an empty rule', () => {
    expect(verifyEvidence(raw({ rule: '   ' }), byPath)).toBeNull();
  });

  it('uses a single-line evidence path when the window is one line', () => {
    const oneLine = new Map([['a.ts', 'only line']]);
    const v = verifyEvidence(raw({ evidence: { file: 'a.ts', line: 1 } }), oneLine);
    expect(v!.evidencePath).toBe('a.ts:1');
  });
});

describe('clamp01', () => {
  it('clamps out-of-range and non-finite values', () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
  });
});

describe('slugify', () => {
  it('kebab-cases and caps length', () => {
    expect(slugify('Always use async/await instead of .then() chains')).toBe('always-use-async-await-instead-of');
    expect(slugify('!!!')).toBe('rule');
  });
});

describe('renderSkillBody', () => {
  const rows: ConventionRow[] = [
    {
      id: '1',
      workspaceId: 'w',
      repoId: 'r',
      rule: 'Always use async/await',
      evidencePath: 'src/api/users.ts:23-25',
      evidenceSnippet: 'const u = await db.find(id);',
      confidence: 0.91,
      accepted: true,
    },
  ];

  it('merges accepted conventions into a titled markdown body with evidence', () => {
    const body = renderSkillBody('payments-api-conventions', 'payments-api', rows);
    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('House conventions for `payments-api`');
    expect(body).toContain('## always-use-async-await');
    expect(body).toContain('Always use async/await');
    expect(body).toContain('Detected in `src/api/users.ts:23-25`:');
    expect(body).toContain('const u = await db.find(id);');
  });
});
