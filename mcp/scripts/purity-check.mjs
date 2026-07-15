#!/usr/bin/env node
/**
 * The checks dependency-cruiser CANNOT make.
 *
 * `arch:check` reasons about module EDGES. But the two rules this package most needs
 * are about GLOBALS, which have no import to cruise:
 *
 *   1. stdout purity — stdout IS the JSON-RPC frame. One `console.log` anywhere in the
 *      process corrupts it, and the host reports only an unreadable "failed to connect".
 *      Every diagnostic goes to stderr (`console.error`).
 *   2. domain purity — `format.ts` / `errors.ts` / `schemas.ts` are the pure ring.
 *      `fetch()` and `process.env` are GLOBALS: dependency-cruiser sees no edge, so a
 *      `fetch()` added to format.ts tomorrow would pass `arch:check` green. This does not.
 *
 * Run: npm run purity:check   (and it runs in CI — see .github/workflows/mcp.yml)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const DOMAIN = ['format.ts', 'errors.ts', 'schemas.ts'];

/** Strip line- and block-comments so a rule NAMED in a comment is not a violation. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.ts') ? [p] : [];
  });
}

const violations = [];

for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  const isTest = rel.endsWith('.test.ts');
  const code = strip(readFileSync(file, 'utf8'));

  // 1. stdout purity — production code only; a test may print.
  if (!isTest) {
    code.split('\n').forEach((line, i) => {
      if (/\bconsole\.log\b|\bprocess\.stdout\b/.test(line)) {
        violations.push(`${rel}:${i + 1} — writes to STDOUT. stdout is the JSON-RPC frame; use console.error.`);
      }
    });
  }

  // 2. domain purity — no I/O globals in the pure ring.
  if (DOMAIN.includes(rel)) {
    code.split('\n').forEach((line, i) => {
      const bad = /\bfetch\s*\(|\bprocess\.env\b|\brequire\s*\(|\bnew\s+Date\b|\bMath\.random\b/.exec(line);
      if (bad) {
        violations.push(`${rel}:${i + 1} — '${bad[0].trim()}' in the pure domain ring. Take it as an argument instead.`);
      }
    });
  }
}

if (violations.length) {
  console.error('✘ purity check FAILED\n');
  for (const v of violations) console.error('  ' + v);
  console.error(`\n${violations.length} violation(s). These are the two failure modes arch:check cannot see.`);
  process.exit(1);
}

console.error(`✔ purity check clean — no stdout writes outside tests, domain ring (${DOMAIN.join(', ')}) free of I/O globals`);
