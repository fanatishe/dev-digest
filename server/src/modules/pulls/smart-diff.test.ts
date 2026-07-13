/**
 * Smart Diff — the PURE builder (`buildSmartDiff` + `deriveSummary`). No DB, no
 * container, no model: if any of these tests ever needs one, the builder has
 * stopped being pure and the feature's central invariant is gone.
 */
import { describe, it, expect } from 'vitest';
import { buildSmartDiff, deriveSummary, type SmartDiffInputFile } from './smart-diff.js';

const file = (
  path: string,
  additions = 1,
  deletions = 0,
  patch: string | null = null,
): SmartDiffInputFile => ({ path, additions, deletions, patch });

describe('deriveSummary', () => {
  it('names the symbols declared on ADDED lines', () => {
    const patch = [
      '@@ -1,2 +1,8 @@',
      ' const existing = 1;',
      '+export function rateLimit(req) {',
      '+  return true;',
      '+}',
      '+const bucketKey = (id) => id;',
    ].join('\n');
    expect(deriveSummary(patch)).toBe('Changed: rateLimit(), bucketKey()');
  });

  it('renders a type/class bare and a function as name()', () => {
    const patch = ['+export interface Budget {', '+export class Limiter {'].join('\n');
    expect(deriveSummary(patch)).toBe('Changed: Budget, Limiter');
  });

  it('ignores removed lines, context lines, and the +++ file header', () => {
    const patch = [
      '+++ b/src/a.ts',
      '-export function removedFn() {}',
      ' export function contextFn() {}',
      '+export function addedFn() {}',
    ].join('\n');
    expect(deriveSummary(patch)).toBe('Changed: addedFn()');
  });

  it('returns null when nothing is extractable (the field is nullish)', () => {
    expect(deriveSummary(null)).toBeNull();
    expect(deriveSummary('')).toBeNull();
    expect(deriveSummary('@@ -1 +1 @@\n+  // just a comment\n+\n')).toBeNull();
    // control-flow keywords are not symbols
    expect(deriveSummary('+  if (x) {\n+  for (const y of z) {\n')).toBeNull();
  });

  it('caps the summary — an attacker-authored patch cannot inflate the response', () => {
    const patch = Array.from(
      { length: 50 },
      (_, i) => `+export function someRatherLongFunctionName${i}() {}`,
    ).join('\n');
    const summary = deriveSummary(patch)!;
    expect(summary.length).toBeLessThanOrEqual(120);
    // at most 4 symbols collected
    expect(summary.split(',').length).toBeLessThanOrEqual(4);
  });

  it('skips a minified mega-line instead of chewing through it', () => {
    const patch = `+export function real() {}\n+${'export function fake(){};'.repeat(5_000)}`;
    const start = Date.now();
    expect(deriveSummary(patch)).toBe('Changed: real()');
    expect(Date.now() - start).toBeLessThan(1_000);
  });
});

describe('buildSmartDiff', () => {
  const files = [
    file('pnpm-lock.yaml', 900, 300), // boilerplate, huge
    file('src/index.ts', 2, 1), // wiring
    file('package.json', 5, 0), // wiring, bigger than index.ts
    file('src/modules/reviews/service.ts', 10, 2), // core
    file('src/modules/pulls/routes.ts', 3, 1), // core, smaller, but FLAGGED
  ];
  const findings = [
    { file: 'src/modules/pulls/routes.ts', startLine: 42 },
    { file: 'src/modules/pulls/routes.ts', startLine: 7 },
  ];

  // Regression: `pr_files` has no UNIQUE (pr_id, path), and the old racy
  // DELETE-then-INSERT mirror in GET /pulls/:id left duplicate rows in real
  // databases. Two entries with the same `path` are two React children with the
  // same key — a hard crash in both diff viewers. Emit one entry per path.
  it('emits ONE entry per path even when the input rows are duplicated', () => {
    const dupes = [...files, file('src/modules/reviews/service.ts', 10, 2)];
    const out = buildSmartDiff(dupes, findings);

    const paths = out.groups.flatMap((g) => g.files.map((f) => f.path));
    expect(paths).toHaveLength(new Set(paths).size); // no duplicate keys
    expect(paths.filter((p) => p === 'src/modules/reviews/service.ts')).toHaveLength(1);
  });

  it('orders groups core → wiring → boilerplate', () => {
    const out = buildSmartDiff(files, findings);
    expect(out.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
  });

  it('sorts flagged files first, then by size descending', () => {
    const out = buildSmartDiff(files, findings);
    const core = out.groups.find((g) => g.role === 'core')!;
    // routes.ts is SMALLER than service.ts but carries findings → it leads.
    expect(core.files.map((f) => f.path)).toEqual([
      'src/modules/pulls/routes.ts',
      'src/modules/reviews/service.ts',
    ]);
    const wiring = out.groups.find((g) => g.role === 'wiring')!;
    expect(wiring.files.map((f) => f.path)).toEqual(['package.json', 'src/index.ts']);
  });

  it('attaches unique, ascending finding_lines to the right file only', () => {
    const out = buildSmartDiff(files, findings);
    const core = out.groups.find((g) => g.role === 'core')!;
    expect(core.files[0]!.finding_lines).toEqual([7, 42]);
    expect(core.files[1]!.finding_lines).toEqual([]);
  });

  it('omits empty groups', () => {
    const out = buildSmartDiff([file('src/service.ts')], []);
    expect(out.groups.map((g) => g.role)).toEqual(['core']);
  });

  it('always emits split_suggestion, even when the PR is small', () => {
    const out = buildSmartDiff([file('src/a.ts', 1, 1)], []);
    expect(out.split_suggestion).toEqual({
      too_big: false,
      total_lines: 2,
      proposed_splits: [{ name: 'core', files: ['src/a.ts'] }],
    });
  });

  it('flags too_big past the line threshold', () => {
    const out = buildSmartDiff(files, findings);
    expect(out.split_suggestion.total_lines).toBe(1_224);
    expect(out.split_suggestion.too_big).toBe(true);
    expect(out.split_suggestion.proposed_splits.map((s) => s.name)).toEqual([
      'core',
      'wiring',
      'boilerplate',
    ]);
  });

  it('flags too_big past the FILE threshold even when the diff is tiny', () => {
    const many = Array.from({ length: 21 }, (_, i) => file(`src/f${i}.ts`, 1, 0));
    const out = buildSmartDiff(many, []);
    expect(out.split_suggestion.total_lines).toBe(21);
    expect(out.split_suggestion.too_big).toBe(true);
  });

  it('handles a PR with no review — every finding_lines is empty, no crash', () => {
    const out = buildSmartDiff(files, []);
    const all = out.groups.flatMap((g) => g.files);
    expect(all).toHaveLength(5);
    expect(all.every((f) => f.finding_lines.length === 0)).toBe(true);
    expect(out.split_suggestion.too_big).toBe(true);
  });

  it('is deterministic — ties break on path', () => {
    const tied = [file('src/b.ts', 1, 1), file('src/a.ts', 1, 1), file('src/c.ts', 1, 1)];
    const once = buildSmartDiff(tied, []);
    const twice = buildSmartDiff(tied, []);
    expect(once.groups[0]!.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(once).toEqual(twice);
  });

  it('derives pseudocode_summary per file from the patch, with no model call', () => {
    const out = buildSmartDiff(
      [file('src/limiter.ts', 3, 0, '@@ -0,0 +1,3 @@\n+export function rateLimit() {}')],
      [],
    );
    expect(out.groups[0]!.files[0]!.pseudocode_summary).toBe('Changed: rateLimit()');
  });
});
