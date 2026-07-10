#!/usr/bin/env node
/**
 * pr-self-review — the deterministic half of the local pre-PR gate.
 *
 * Pure Node (>=18), zero deps. Three subcommands:
 *
 *   classify   (default) — diff the branch vs main (+ working tree), bucket the
 *                          changed files, and print WHICH skills the agent should
 *                          invoke over WHICH files+hunks. Fast; no LLM, no tests.
 *   preflight            — run the deterministic CRITICAL checks (onion boundaries
 *                          via dependency-cruiser, CI-equivalent typecheck/tests for
 *                          touched packages, secret-scan, shared-table guard) and
 *                          print the findings as JSON.
 *   gate                 — read LLM + preflight findings (stdin or --findings <f>),
 *                          apply the verdict rule, write .devdigest/cache/self-review.*
 *                          and EXIT 1 when the verdict is `request_changes` (BLOCK).
 *
 * Findings and the final report use DevDigest's own contract
 * (server/src/vendor/shared/contracts/findings.ts):
 *   Severity = CRITICAL | WARNING | SUGGESTION
 *   Verdict  = request_changes | approve | comment
 *   confidence = number 0..1     (>= 0.8 counts as "high confidence")
 *
 * The BLOCK verdict is `request_changes`, emitted when >=1 CRITICAL finding has
 * confidence >= 0.8. Pre-flight CRITICALs are deterministic → confidence 1.
 *
 * Run from the repo root (paths below are repo-relative).
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIGH_CONFIDENCE = 0.8;
const REPORT_DIR = '.devdigest/cache';
const ONION_CFG =
  '.claude/skills/onion-architecture/assets/onion.dependency-cruiser.cjs';

// ── File → bucket → skills. Single source of truth; SKILL.md mirrors this. ──────
// Order matters: first matching bucket wins for the "primary" classification,
// but a file can accumulate skills from every bucket whose glob it matches
// (e.g. a client component also picks up the cross-cutting bucket).
const BUCKETS = [
  {
    id: 'ui-tests',
    test: (f) => /^client\/.*\.test\.tsx?$/.test(f),
    skills: ['react-testing-library'],
  },
  {
    id: 'ui-pages-components',
    test: (f) =>
      !/\.test\.tsx?$/.test(f) &&
      (/^client\/src\/app\//.test(f) ||
        /^client\/src\/components\//.test(f) ||
        /^client\/.*\.tsx$/.test(f)),
    skills: ['frontend-ui-architecture', 'react-best-practices', 'next-best-practices'],
  },
  {
    id: 'ui-lib-hooks',
    test: (f) => /^client\/src\/lib\//.test(f) && !/\.test\.tsx?$/.test(f),
    skills: ['react-best-practices', 'frontend-ui-architecture'],
  },
  {
    id: 'shared-contracts',
    test: (f) => /\/src\/vendor\/shared\//.test(f),
    skills: ['zod'],
  },
  {
    id: 'db-schema',
    test: (f) => /^server\/src\/db\/(schema|migrations)\//.test(f),
    skills: ['postgresql-table-design', 'drizzle-orm-patterns'],
  },
  {
    id: 'backend-http',
    test: (f) =>
      /^server\/src\/modules\/[^/]+\/routes\.ts$/.test(f) ||
      /^server\/src\/(app|server)\.ts$/.test(f),
    skills: ['fastify-best-practices', 'onion-architecture'],
  },
  {
    id: 'backend-adapters',
    test: (f) => /^server\/src\/adapters\//.test(f),
    skills: ['onion-architecture', 'security'],
  },
  {
    id: 'backend-app-infra',
    test: (f) =>
      /^server\/src\/modules\/[^/]+\/(service|repository)\.ts$/.test(f) ||
      /^server\/src\/platform\//.test(f),
    skills: ['onion-architecture'],
  },
  {
    id: 'pure-engine',
    test: (f) => /^reviewer-core\/src\//.test(f),
    skills: ['onion-architecture', 'typescript-expert'],
  },
  {
    // Cross-cutting: every touched TS/TSX file also gets a secrets/types pass.
    id: 'cross-cutting',
    test: (f) => /\.tsx?$/.test(f),
    skills: ['security', 'typescript-expert'],
  },
];

// ── git helpers ────────────────────────────────────────────────────────────────
function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function mergeBase() {
  try {
    return git(['merge-base', 'main', 'HEAD']).trim();
  } catch {
    // No `main` locally (fresh clone / detached) — fall back to origin/main, then HEAD.
    try {
      return git(['merge-base', 'origin/main', 'HEAD']).trim();
    } catch {
      return git(['rev-parse', 'HEAD']).trim();
    }
  }
}

/**
 * The review set = everything that would land in a PR from this branch:
 * merge-base(main)..working-tree (committed branch work + uncommitted edits),
 * plus untracked files. Returns [{ file, status, hunks:[{start,end}], removed:bool }].
 */
function reviewSet() {
  const base = mergeBase();
  const files = new Map();

  // Tracked, committed + uncommitted (base..worktree), rename-aware.
  const nameStatus = git(['diff', '--name-status', '--find-renames', base]).trim();
  for (const line of nameStatus ? nameStatus.split('\n') : []) {
    const parts = line.split('\t');
    const code = parts[0][0]; // A|M|D|R|C
    const file = code === 'R' || code === 'C' ? parts[2] : parts[1];
    files.set(file, { file, status: code, hunks: [], removed: false });
  }

  // Untracked (never committed, not ignored) — treat as added, whole file.
  const untracked = git(['ls-files', '--others', '--exclude-standard']).trim();
  for (const file of untracked ? untracked.split('\n') : []) {
    if (!files.has(file)) files.set(file, { file, status: 'A', hunks: [], removed: false });
  }

  // Hunks + whether the change removes existing lines (base..worktree, no context).
  const diff = git(['diff', '-U0', '--find-renames', base]);
  parseHunks(diff, files);

  return [...files.values()].filter((f) => f.status !== 'D');
}

/** Parse `git diff -U0` output: fill per-file new-side line ranges + removed flag. */
function parseHunks(diff, files) {
  let cur = null;
  for (const line of diff.split('\n')) {
    const plus = line.match(/^\+\+\+ b\/(.*)$/);
    if (plus) {
      cur = files.get(plus[1]) ?? null;
      continue;
    }
    if (!cur) continue;
    const at = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (at) {
      const start = Number(at[1]);
      const count = at[2] === undefined ? 1 : Number(at[2]);
      if (count > 0) cur.hunks.push({ start, end: start + count - 1 });
      continue;
    }
    // A real removed content line (not the `--- a/…` header) => existing code changed.
    if (line.startsWith('-') && !line.startsWith('---')) cur.removed = true;
  }
}

// ── classify ─────────────────────────────────────────────────────────────────
function classify(set) {
  const perSkill = new Map(); // skill -> [{file, hunks}]
  const perFile = [];
  for (const item of set) {
    const matched = new Set();
    for (const b of BUCKETS) {
      if (b.test(item.file)) b.skills.forEach((s) => matched.add(s));
    }
    perFile.push({ file: item.file, status: item.status, skills: [...matched] });
    for (const skill of matched) {
      if (!perSkill.has(skill)) perSkill.set(skill, []);
      perSkill.get(skill).push({ file: item.file, hunks: item.hunks });
    }
  }
  return { perFile, perSkill: Object.fromEntries(perSkill) };
}

function touchedPackages(set) {
  const pkgs = new Set();
  for (const { file } of set) {
    if (file.startsWith('client/')) pkgs.add('client');
    if (file.startsWith('server/')) pkgs.add('server');
    // reviewer-core & the vendored shared contracts are aliased into server at
    // type-check time, so they imply a server check too (mirrors CI path filters).
    if (file.startsWith('reviewer-core/')) {
      pkgs.add('reviewer-core');
      pkgs.add('server');
    }
    if (/\/src\/vendor\/shared\//.test(file)) pkgs.add('server');
  }
  return pkgs;
}

// ── findings helpers (product contract shape) ──────────────────────────────────
let _seq = 0;
function finding({
  severity,
  category,
  title,
  file,
  start = 1,
  end = start,
  rationale,
  suggestion = null,
  confidence,
  kind = 'finding',
}) {
  return {
    id: `preflight-${++_seq}`,
    severity,
    category,
    title,
    file,
    start_line: start,
    end_line: end,
    rationale,
    suggestion,
    confidence,
    kind,
  };
}

// ── tool resolution (works without pnpm/npm on PATH) ───────────────────────────
const BIN = process.platform === 'win32' ? '.cmd' : '';

/** Absolute path to a package-local bin, falling back to server's (shared deps). */
function pkgBin(pkg, name) {
  for (const base of [pkg, 'server']) {
    const p = join(process.cwd(), base, 'node_modules', '.bin', name + BIN);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Run a resolved bin in a package dir; returns {ok, out} where `out` is stdout
 * (captured on success AND failure — some tools print their report to stdout and
 * still exit 0, e.g. `depcruise --output-type json`). Never throws.
 */
function runBin(bin, args, cwd) {
  try {
    const out = execFileSync(bin, args, {
      cwd: join(process.cwd(), cwd),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: String(e.stdout || '') + String(e.stderr || e.message || '') };
  }
}

// ── preflight checks ───────────────────────────────────────────────────────────
function runPreflight(set) {
  const findings = [];
  const changed = new Set(set.map((s) => s.file));

  findings.push(...checkOnion(changed));
  findings.push(...checkPackageChecks(touchedPackages(set)));
  findings.push(...checkSecrets(set));
  findings.push(...checkSharedTables(set));

  return findings;
}

/** Onion boundary violations whose source file is in the diff => CRITICAL. */
function checkOnion(changed) {
  const out = [];
  const cfgAbs = join(process.cwd(), ONION_CFG);
  if (!existsSync(cfgAbs)) return out;
  for (const pkg of ['server', 'reviewer-core']) {
    if (![...changed].some((f) => f.startsWith(`${pkg}/`))) continue;
    const bin = pkgBin(pkg, 'depcruise');
    if (!bin) continue; // dependency-cruiser not installed for this package — skip
    // depcruise exits non-zero WHEN it finds violations, but always prints JSON.
    const res = runBin(bin, ['--config', cfgAbs, '--output-type', 'json', 'src'], pkg);
    let json;
    try {
      json = JSON.parse(res.out);
    } catch {
      out.push(
        finding({
          severity: 'WARNING',
          category: 'style',
          title: `dependency-cruiser could not run in ${pkg}/`,
          file: `${pkg}/`,
          rationale: `Skipped onion boundary check: ${res.out.split('\n').filter(Boolean).slice(-1)[0] || 'no output'}`,
          confidence: 0.5,
        }),
      );
      continue;
    }
    for (const v of json?.summary?.violations ?? []) {
      const src = `${pkg}/${v.from}`;
      if (!changed.has(src)) continue; // only gate on files the PR actually touches
      out.push(
        finding({
          severity: v.rule?.severity === 'error' ? 'CRITICAL' : 'WARNING',
          category: 'bug',
          title: `Onion boundary violation: ${v.rule?.name}`,
          file: src,
          rationale: `${v.rule?.comment || v.rule?.name} — imports \`${v.to}\`.`,
          suggestion: 'Route the dependency through the correct layer (see onion-architecture skill).',
          confidence: 1,
        }),
      );
    }
  }
  return out;
}

/**
 * CI-equivalent typecheck + tests for each touched package, run via package-local
 * bins (no pnpm/npm on PATH required). A failure => CRITICAL.
 * `SELF_REVIEW_SKIP_TESTS=1` skips the vitest runs (typecheck still runs).
 */
function checkPackageChecks(pkgs) {
  const out = [];
  const skipTests = process.env.SELF_REVIEW_SKIP_TESTS === '1';
  const tscArgs = { 'reviewer-core': ['--noEmit', '-p', 'tsconfig.json'] };
  const vitestArgs = {
    server: ['run', '--exclude', '**/*.it.test.ts'],
    'reviewer-core': ['run', '--passWithNoTests'],
    client: ['run'],
  };
  for (const pkg of pkgs) {
    const jobs = [['tsc', tscArgs[pkg] ?? ['--noEmit'], 'bug']];
    if (!skipTests) jobs.push(['vitest', vitestArgs[pkg] ?? ['run'], 'test']);
    for (const [tool, args, category] of jobs) {
      const bin = pkgBin(pkg, tool);
      if (!bin) {
        out.push(
          finding({
            severity: 'WARNING',
            category: 'style',
            title: `${pkg}: \`${tool}\` not found — check skipped`,
            file: `${pkg}/`,
            rationale: `Could not resolve ${tool} in ${pkg}/node_modules — install deps to enable this CI-equivalent check.`,
            confidence: 0.5,
          }),
        );
        continue;
      }
      const res = runBin(bin, args, pkg);
      if (!res.ok) {
        const tail = res.out.split('\n').filter(Boolean).slice(-12).join('\n');
        out.push(
          finding({
            severity: 'CRITICAL',
            category,
            title: `${pkg}: \`${tool} ${args.join(' ')}\` failed`,
            file: `${pkg}/`,
            rationale: `CI runs this on the PR and it currently fails:\n\`\`\`\n${tail}\n\`\`\``,
            confidence: 1,
          }),
        );
      }
    }
  }
  return out;
}

const SECRET_PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/\bsk-[A-Za-z0-9]{20,}\b/, 'OpenAI-style secret key'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/, 'GitHub token'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key material'],
  [/(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"'\s]{8,}["']/i, 'hardcoded credential'],
];

/** Scan ADDED lines in changed hunks for secret material => CRITICAL secret_leak. */
function checkSecrets(set) {
  const out = [];
  const base = mergeBase();
  for (const item of set) {
    if (item.hunks.length === 0) continue;
    let diff;
    try {
      diff = git(['diff', '-U0', base, '--', item.file]);
    } catch {
      continue;
    }
    for (const line of diff.split('\n')) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      const body = line.slice(1);
      for (const [re, label] of SECRET_PATTERNS) {
        if (re.test(body)) {
          out.push(
            finding({
              severity: 'CRITICAL',
              category: 'security',
              title: `Possible ${label} committed`,
              file: item.file,
              rationale:
                'A secret-looking value was added to a tracked file. Secrets must live in ' +
                '`~/.devdigest/secrets.json` (mode 0600), never in git.',
              suggestion: 'Remove it, rotate the credential, and load it via LocalSecretsProvider / env.',
              confidence: 0.9,
              kind: 'secret_leak',
            }),
          );
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Guard the "extend, never migrate the shared tables" invariant. Editing existing
 * lines in a db/schema file, or touching an existing migration, is CRITICAL;
 * purely additive schema changes (new tables/columns) are allowed.
 */
function checkSharedTables(set) {
  const out = [];
  for (const item of set) {
    const isSchema = /^server\/src\/db\/schema\/.*\.ts$/.test(item.file);
    // Only the actual DDL files are immutable history; `migrations/meta/**` is
    // Drizzle bookkeeping that legitimately changes when you ADD a new migration.
    const isMigration = /^server\/src\/db\/migrations\/[^/]+\.sql$/.test(item.file);
    if (isSchema && item.status === 'M' && item.removed) {
      out.push(
        finding({
          severity: 'CRITICAL',
          category: 'bug',
          title: 'Altering an existing shared table',
          file: item.file,
          rationale:
            'This edit removes/changes existing lines in a pre-declared schema file. ' +
            'The DB schema is complete by design — extend with NEW tables/columns instead.',
          suggestion: 'Add a new table/column in a new migration; do not mutate existing ones.',
          confidence: 0.85,
        }),
      );
    }
    if (isMigration && (item.status === 'M' || item.status === 'D')) {
      out.push(
        finding({
          severity: 'CRITICAL',
          category: 'bug',
          title: 'Editing an existing migration',
          file: item.file,
          rationale: 'Existing migrations are immutable history — never edit or delete them.',
          suggestion: 'Generate a new migration with `pnpm db:generate` instead.',
          confidence: 0.9,
        }),
      );
    }
  }
  return out;
}

// ── gate: verdict + report ─────────────────────────────────────────────────────
function decideVerdict(findings) {
  const blocking = findings.filter(
    (f) => f.severity === 'CRITICAL' && (f.confidence ?? 0) >= HIGH_CONFIDENCE,
  );
  if (blocking.length > 0) return { verdict: 'request_changes', blocking };
  if (findings.length > 0) return { verdict: 'comment', blocking: [] };
  return { verdict: 'approve', blocking: [] };
}

function scoreFor(findings) {
  const w = { CRITICAL: 40, WARNING: 10, SUGGESTION: 2 };
  const penalty = findings.reduce((s, f) => s + (w[f.severity] ?? 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function writeReport(review) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, 'self-review.json'), JSON.stringify(review, null, 2));
  writeFileSync(join(REPORT_DIR, 'self-review.md'), toMarkdown(review));
}

function toMarkdown(r) {
  const banner =
    r.verdict === 'request_changes'
      ? `## ❌ Self-review: BLOCKED (${r.findings.filter((f) => f.severity === 'CRITICAL').length} critical)`
      : r.verdict === 'comment'
        ? '## ⚠️ Self-review: passed with warnings'
        : '## ✅ Self-review: passed';
  const rows = r.findings
    .map((f) => `| ${f.severity} | ${f.confidence} | \`${f.file}\`:${f.start_line} | ${f.title} |`)
    .join('\n');
  return `${banner}\n\nScore: **${r.score}/100** — verdict \`${r.verdict}\`.\n\n${
    r.findings.length
      ? `| Severity | Conf | Location | Finding |\n|---|---|---|---|\n${rows}\n`
      : '_No findings._\n'
  }`;
}

// ── output ─────────────────────────────────────────────────────────────────────
function printClassify(set) {
  const { perFile, perSkill } = classify(set);
  const asJson = process.argv.includes('--json');
  const payload = {
    changedFiles: perFile,
    skillsToRun: perSkill,
    packagesToCheck: [...touchedPackages(set)],
  };
  if (asJson) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return;
  }
  if (set.length === 0) {
    console.log('No changes vs main — nothing to review.');
    return;
  }
  console.log(`Changed files (${set.length}) vs merge-base(main) + working tree:\n`);
  for (const f of perFile) console.log(`  [${f.status}] ${f.file}  → ${f.skills.join(', ') || '(none)'}`);
  console.log('\nSkills to invoke (over changed hunks only):');
  for (const [skill, files] of Object.entries(perSkill)) {
    console.log(`  • ${skill}  (${files.length} file${files.length > 1 ? 's' : ''})`);
  }
  console.log(`\nDeterministic checks will cover packages: ${[...touchedPackages(set)].join(', ') || '(none)'}`);
  console.log('\nMachine-readable plan: re-run with --json');
}

function readFindingsArg() {
  const i = process.argv.indexOf('--findings');
  if (i !== -1 && process.argv[i + 1]) return JSON.parse(readFileSync(process.argv[i + 1], 'utf8'));
  const stdin = readFileSync(0, 'utf8').trim();
  return stdin ? JSON.parse(stdin) : [];
}

// Exported for tests/harnesses; the CLI dispatch below only runs when invoked directly.
export { reviewSet, classify, runPreflight, decideVerdict, checkOnion, checkSecrets, checkSharedTables, BUCKETS };

// ── main ───────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const cmd = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'classify';

if (!isMain) {
  // imported as a module — do nothing on load
} else if (cmd === 'classify') {
  printClassify(reviewSet());
} else if (cmd === 'preflight') {
  process.stdout.write(JSON.stringify(runPreflight(reviewSet()), null, 2) + '\n');
} else if (cmd === 'gate') {
  const set = reviewSet();
  const external = readFindingsArg(); // LLM-produced findings (array of Finding)
  const preflight = process.argv.includes('--no-preflight') ? [] : runPreflight(set);
  const findings = [...preflight, ...(Array.isArray(external) ? external : external.findings ?? [])];
  const { verdict, blocking } = decideVerdict(findings);
  const review = {
    verdict,
    summary:
      verdict === 'request_changes'
        ? `Blocked by ${blocking.length} high-confidence critical finding(s).`
        : verdict === 'comment'
          ? `${findings.length} non-blocking finding(s).`
          : 'No findings — good to open the PR.',
    score: scoreFor(findings),
    findings,
  };
  writeReport(review);
  process.stdout.write(toMarkdown(review) + '\n');
  if (verdict === 'request_changes') {
    console.error(`\n❌ BLOCKED: ${blocking.length} critical issue(s) — do NOT open the PR.`);
    process.exit(1);
  }
} else {
  const self = fileURLToPath(import.meta.url);
  console.error(`Unknown command "${cmd}".\nUsage: node ${dirname(self)}/self-review.mjs [classify|preflight|gate] [--json] [--findings <f>] [--no-preflight]`);
  process.exit(2);
}
