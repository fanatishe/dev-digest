/**
 * Smart Diff — the file-role classifier (L03's named acceptance criterion:
 * `pnpm run verify:l03`).
 *
 * Colocated in `src/` on purpose: `verify:l03` names this exact path, and
 * `vitest.config.ts` already collects `src/**\/*.test.ts`. It is a PURE unit
 * suite — no DB, no Docker, no container.
 */
import { describe, it, expect } from 'vitest';
import { classifyFile } from './classifier.js';
import type { SmartDiffRole } from '@devdigest/shared';

/** table-driven: [path, expected role] */
const CASES: [string, SmartDiffRole][] = [
  // ---- boilerplate (the four MANDATED cases start here) --------------------
  ['pnpm-lock.yaml', 'boilerplate'], // ← mandated
  ['0001_migration.sql', 'boilerplate'], // ← mandated
  ['package-lock.json', 'boilerplate'], // first-match-wins vs package.json
  ['yarn.lock', 'boilerplate'],
  ['Cargo.lock', 'boilerplate'], // case-insensitive
  ['dist/bundle.js', 'boilerplate'], // build output
  ['client/.next/static/chunk.js', 'boilerplate'],
  ['src/components/__snapshots__/Card.snap', 'boilerplate'],
  ['src/types/api.d.ts', 'boilerplate'], // generated typings
  ['public/vendor/jquery.min.js', 'boilerplate'],
  ['src/foo.test.ts', 'boilerplate'], // tests beat core
  ['client/src/app/page.spec.tsx', 'boilerplate'],
  ['server/src/db/migrations/meta/0001_snapshot.json', 'boilerplate'], // drizzle/meta is matched below too
  ['server/src/routes.gen.ts', 'boilerplate'],
  ['server/src/vendor/shared/index.ts', 'boilerplate'], // vendored tree, not our core

  // ---- wiring -------------------------------------------------------------
  ['src/index.ts', 'wiring'], // ← mandated
  ['package.json', 'wiring'], // the deliberate deviation (vs package-lock.json)
  ['server/src/app.ts', 'wiring'],
  ['server/src/server.ts', 'wiring'],
  ['client/next.config.mjs', 'wiring'],
  ['server/tsconfig.json', 'wiring'],
  ['server/tsconfig.build.json', 'wiring'],
  ['.env.production', 'wiring'],
  ['Dockerfile', 'wiring'],
  ['.github/workflows/ci.yml', 'wiring'],
  ['client/messages/en/prReview.json', 'wiring'], // i18n catalogs
  ['server/vitest.config.ts', 'wiring'],

  // ---- core ---------------------------------------------------------------
  ['src/modules/reviews/service.ts', 'core'], // ← mandated
  ['server/src/modules/pulls/routes.ts', 'core'],
  ['client/src/components/diff-viewer/FileCard/FileCard.tsx', 'core'],
  ['reviewer-core/src/engine.ts', 'core'],
  ['server/src/platform/jobs.ts', 'core'],
  ['README.md', 'core'], // unrecognized → core (the safe bias: never collapsed)
  ['src/vendor.ts', 'core'], // `vendor` as a FILE, not a directory segment
];

describe('classifyFile', () => {
  it.each(CASES)('classifies %s as %s', (path, expected) => {
    expect(classifyFile(path)).toBe(expected);
  });

  it('covers at least 15 cases, at least 5 per role', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(15);
    for (const role of ['core', 'wiring', 'boilerplate'] as const) {
      expect(CASES.filter(([, r]) => r === role).length).toBeGreaterThanOrEqual(5);
    }
  });

  it('pins the four acceptance cases verbatim', () => {
    expect(classifyFile('pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyFile('0001_migration.sql')).toBe('boilerplate');
    expect(classifyFile('src/modules/reviews/service.ts')).toBe('core');
    expect(classifyFile('src/index.ts')).toBe('wiring');
  });

  it('applies first-match-wins: boilerplate beats wiring beats core', () => {
    // `package-lock.json` matches a lock file (boilerplate) AND would match
    // nothing in wiring; `package.json` is wiring. Same directory, same suffix.
    expect(classifyFile('package-lock.json')).toBe('boilerplate');
    expect(classifyFile('package.json')).toBe('wiring');
    // `src/index.test.ts` is BOTH an entrypoint basename pattern (wiring) and a
    // test (boilerplate) — boilerplate is checked first, so it wins.
    expect(classifyFile('src/index.test.ts')).toBe('boilerplate');
  });

  it('is total — every path gets a role, including degenerate ones', () => {
    expect(classifyFile('')).toBe('core');
    expect(classifyFile('/')).toBe('core');
    expect(classifyFile('a')).toBe('core');
  });

  it('normalizes separators and a leading ./', () => {
    expect(classifyFile('./src/index.ts')).toBe('wiring');
    expect(classifyFile('src\\index.ts')).toBe('wiring');
  });

  it('does not hang on a hostile path (ReDoS guard)', () => {
    // A pathological basename ("a.a.a.….config.ts") aimed at the `.config.<ext>`
    // pattern. It legitimately classifies as wiring — the point of the test is
    // that it returns FAST: the patterns are anchored and carry no nested
    // quantifier, so matching is linear. If one ever creeps in, this times out.
    const hostile = `${'a.'.repeat(20_000)}config.ts`;
    const start = Date.now();
    expect(classifyFile(hostile)).toBe('wiring');
    expect(Date.now() - start).toBeLessThan(1_000);
  });
});
