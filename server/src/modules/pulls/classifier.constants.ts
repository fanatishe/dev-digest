import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff — the ONLY file holding a pattern or a threshold for the CLASSIFIER
 * and the diff summary. `classifier.ts` and `smart-diff.ts` are pure consumers:
 * no regex, no magic number lives anywhere else in that path.
 *
 * (The module's non-classification constants — e.g. the intent-enqueue spend cap
 * used by the PR-list handler — live in `./constants.ts`. That is a policy of the
 * HTTP read, not of classification, and it does not belong in this table.)
 *
 * SECURITY (ReDoS): every pattern here runs against ATTACKER-AUTHORED input — a
 * PR author controls every byte of a file path and of a patch. So each pattern
 * is anchored, uses bounded character classes, and contains NO nested quantifier
 * (`(a+)+`-shaped ambiguity is what turns a regex into an event-loop hang).
 * Path matching is deliberately done with plain string operations (basenames,
 * segments, suffixes) wherever a regex is not strictly necessary — a `Set.has`
 * cannot backtrack at all.
 */

// ---- Group order --------------------------------------------------------

/** Render order of the groups. Empty groups are dropped, not rendered. */
export const GROUP_ORDER: readonly SmartDiffRole[] = ['core', 'wiring', 'boilerplate'] as const;

// ---- boilerplate --------------------------------------------------------
// Checked FIRST (first match wins), so `package-lock.json` lands here while
// `package.json` falls through to `wiring` — the deliberate deviation recorded
// in the plan.

/** Exact (lower-cased) basenames that are always boilerplate: lock files. */
export const BOILERPLATE_BASENAMES: ReadonlySet<string> = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'go.sum',
  'cargo.lock',
  'composer.lock',
  'gemfile.lock',
]);

/** Path SEGMENTS (a whole `/`-delimited component) that mark generated trees. */
export const BOILERPLATE_SEGMENTS: ReadonlySet<string> = new Set([
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  '__snapshots__',
  'vendor',
  'node_modules',
]);

/** Lower-cased basename suffixes: migrations, snapshots, generated typings. */
export const BOILERPLATE_SUFFIXES: readonly string[] = [
  '.sql',
  '.snap',
  '.d.ts',
  '.min.js',
  '.min.css',
  '.lock',
] as const;

/**
 * Sub-path fragments. Drizzle's generated snapshot/journal sidecar is the
 * canonical case. NOTE the real path in this repo is `src/db/migrations/meta/`
 * (see `drizzle.config.ts` → `out: './src/db/migrations'`) — there is no
 * `drizzle/` directory — so BOTH shapes are listed: the generic one for repos
 * that use the default layout, and ours.
 */
export const BOILERPLATE_FRAGMENTS: readonly string[] = [
  'drizzle/meta/',
  'migrations/meta/',
] as const;

/**
 * Basename patterns for boilerplate. Anchored at both ends, single bounded
 * quantifier each — linear time, no backtracking blowup.
 *   `foo.test.ts` · `foo.spec.tsx` → tests beat core (deliberate)
 *   `routes.gen.ts` · `schema.gen.json` → generated
 */
export const BOILERPLATE_BASENAME_PATTERNS: readonly RegExp[] = [
  /\.(test|spec)\.[a-z0-9]{1,10}$/,
  /\.gen\.[a-z0-9]{1,10}$/,
] as const;

// ---- wiring -------------------------------------------------------------

/** Exact (lower-cased) basenames: entrypoints, barrels, and root configs. */
export const WIRING_BASENAMES: ReadonlySet<string> = new Set([
  // configs
  'package.json',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'makefile',
  // barrels / entrypoints (the plan's list, across the usual extensions)
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mjs',
  'server.ts',
  'server.js',
  'main.ts',
  'main.js',
  'app.ts',
  'app.js',
]);

/** Path segments whose whole subtree is wiring: i18n message catalogs + CI. */
export const WIRING_SEGMENTS: ReadonlySet<string> = new Set([
  'messages',
  'locales',
  'i18n',
  '.github',
]);

/**
 * Basename patterns for wiring. Same ReDoS discipline as above: each is a
 * single bounded quantifier against a short basename.
 *   `vite.config.ts` · `drizzle.config.ts` → `.config.<ext>`
 *   `tsconfig.json` · `tsconfig.build.json`
 *   `.env` · `.env.local` · `.env.production`
 */
export const WIRING_BASENAME_PATTERNS: readonly RegExp[] = [
  /\.config\.[a-z0-9]{1,10}$/,
  /^tsconfig[a-z0-9.-]{0,32}\.json$/,
  /^\.env[a-z0-9.-]{0,32}$/,
] as const;

// ---- split suggestion ---------------------------------------------------

/** A PR past EITHER threshold is advertised as "too big to review in one pass". */
export const SPLIT_TOO_BIG_LINES = 400;
export const SPLIT_TOO_BIG_FILES = 20;

// ---- pseudocode summary -------------------------------------------------

/**
 * Caps for `deriveSummary`. The patch is attacker-authored: a single minified
 * 5 MB line, or a 200k-line generated file, must cost us a bounded amount of
 * work and produce a bounded string — an uncapped derived summary is a
 * response-size DoS.
 */
export const SUMMARY_MAX_PATCH_LINES = 2_000;
export const SUMMARY_MAX_LINE_LEN = 300;
export const SUMMARY_MAX_SYMBOLS = 4;
export const SUMMARY_MAX_LEN = 120;
export const SUMMARY_PREFIX = 'Changed: ';

/**
 * Declaration patterns matched against a trimmed ADDED (`+`) patch line.
 * `callable: true` renders as `name()`; a type/interface/enum renders bare.
 *
 * All are anchored at the start of the trimmed line and cap the identifier at
 * 64 chars — no `.*`, no nested quantifier.
 */
export const SYMBOL_PATTERNS: readonly { re: RegExp; callable: boolean }[] = [
  { re: /^(?:export\s)?\s*(?:default\s)?\s*(?:async\s)?\s*function\s+\*?([A-Za-z_$][\w$]{0,63})/, callable: true },
  { re: /^(?:export\s)?\s*(?:default\s)?\s*(?:abstract\s)?\s*class\s+([A-Za-z_$][\w$]{0,63})/, callable: false },
  { re: /^(?:export\s)?\s*(?:type|interface|enum)\s+([A-Za-z_$][\w$]{0,63})/, callable: false },
  { re: /^(?:export\s)?\s*(?:const|let|var)\s+([A-Za-z_$][\w$]{0,63})\s*=\s*(?:async\s)?\s*(?:function|\()/, callable: true },
  { re: /^(?:export\s)?\s*(?:const|let|var)\s+([A-Za-z_$][\w$]{0,63})\s*=/, callable: false },
  // A class method / object member: `bucketKey(req: Request) {`
  { re: /^(?:(?:public|private|protected|static|async)\s+){0,3}([A-Za-z_$][\w$]{0,63})\s*\(/, callable: true },
] as const;

/**
 * Words the method pattern would otherwise happily "declare". `if (`, `for (`,
 * `catch (` are not symbols.
 */
export const SYMBOL_STOP_WORDS: ReadonlySet<string> = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'await',
  'typeof',
  'super',
  'this',
  'new',
  'do',
  'else',
  'with',
  'yield',
  'delete',
  'void',
  'in',
  'of',
  'import',
  'export',
  'require',
  'describe',
  'it',
  'test',
  'expect',
]);
