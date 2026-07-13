import type { SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_BASENAMES,
  BOILERPLATE_BASENAME_PATTERNS,
  BOILERPLATE_FRAGMENTS,
  BOILERPLATE_SEGMENTS,
  BOILERPLATE_SUFFIXES,
  WIRING_BASENAMES,
  WIRING_BASENAME_PATTERNS,
  WIRING_SEGMENTS,
} from './classifier.constants.js';

/**
 * Smart Diff — file-role classifier. PURE: no I/O, no container, no Drizzle, no
 * Fastify. It imports the `SmartDiffRole` TYPE from the shared contract and its
 * patterns from `classifier.constants.ts`, and nothing else — this is the
 * domain ring.
 *
 * FIRST MATCH WINS, in the order boilerplate → wiring → core. That order is the
 * whole semantics: `package-lock.json` is a lock file (boilerplate) before it is
 * a `*.json` config, and `src/foo.test.ts` is a test (boilerplate) before it is
 * source (core).
 */

/**
 * Split a path into lower-cased, normalized parts. Deliberately regex-free
 * (split/join/startsWith): the only regexes in this feature live in
 * `classifier.constants.ts`, and a `Set.has` on a segment cannot backtrack at
 * all — which matters, because the path is attacker-authored.
 */
function parts(path: string): { segments: string[]; basename: string; normalized: string } {
  let normalized = path.split('\\').join('/').toLowerCase();
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  const segments = normalized.split('/').filter((s) => s.length > 0);
  return { segments, basename: segments[segments.length - 1] ?? '', normalized };
}

function isBoilerplate(p: ReturnType<typeof parts>): boolean {
  if (BOILERPLATE_BASENAMES.has(p.basename)) return true;
  // A *directory* segment only — the last segment is the file itself, so
  // `src/vendor.ts` is core while `src/vendor/ui.ts` is boilerplate.
  if (p.segments.slice(0, -1).some((s) => BOILERPLATE_SEGMENTS.has(s))) return true;
  if (BOILERPLATE_SUFFIXES.some((suffix) => p.basename.endsWith(suffix))) return true;
  if (BOILERPLATE_FRAGMENTS.some((fragment) => p.normalized.includes(fragment))) return true;
  return BOILERPLATE_BASENAME_PATTERNS.some((re) => re.test(p.basename));
}

function isWiring(p: ReturnType<typeof parts>): boolean {
  if (WIRING_BASENAMES.has(p.basename)) return true;
  if (p.segments.slice(0, -1).some((s) => WIRING_SEGMENTS.has(s))) return true;
  return WIRING_BASENAME_PATTERNS.some((re) => re.test(p.basename));
}

/**
 * The role a changed file plays in a PR. Total function: every path gets a
 * role, and `core` is the default (an unrecognized path is business logic until
 * proven otherwise — the safe bias, since `core` is the group we never collapse).
 */
export function classifyFile(path: string): SmartDiffRole {
  const p = parts(path);
  if (p.basename === '') return 'core';
  if (isBoilerplate(p)) return 'boilerplate';
  if (isWiring(p)) return 'wiring';
  return 'core';
}
