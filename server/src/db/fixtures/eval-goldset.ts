import type { BatchCase } from '@devdigest/reviewer-core';
import type { EvalExpectedOutput, Finding } from '@devdigest/shared';

/**
 * Synthetic eval gold-set (L06) — the data behind the no-key demo (AC-16, AC-17,
 * AC-26).
 *
 * This module is PURE DATA + PURE DERIVATION: one agent with an improving system
 * prompt across several versions, ≥8 eval cases (a mix of `must_find` and
 * `must_not_flag`), and — per version — a synthetic `{ grounded, producedCount }`
 * engine output for each case. The seed (`db/seed.ts`) feeds these fixtures to the
 * PURE scorer (`scoreCase`/`scoreBatch`, zero LLM) at seed time and inserts the
 * resulting `eval_runs` + `eval_batches`, so the dashboard/trend/Compare are
 * populated on a fresh DB with no API key and every stored metric is REAL scorer
 * output, not hand-typed.
 *
 * Security (skill note): everything here is DATA — small illustrative diffs and
 * expected-output records. No secret, key, or credential ever appears; the diffs
 * describe issues (an N+1 loop, a string-concatenated query) without embedding any
 * secret literal, so nothing sensitive enters the seed or the DB.
 */

// ---------------------------------------------------------------- Agent + versions

/** The gold-set agent's name — the idempotency key in the seed. */
export const GOLDSET_AGENT_NAME = 'Gold-set Reviewer';

export const GOLDSET_AGENT_DESCRIPTION =
  'Demo reviewer with a seeded eval history: recall/precision climb as its prompt improves across versions.';

export const GOLDSET_AGENT_PROVIDER = 'openrouter' as const;
export const GOLDSET_AGENT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * One config snapshot per version. The prompt strictly improves v1→v4, so the
 * seeded trend rises and a run-vs-run Compare shows a real system-prompt diff
 * (AC-23). `ranAtDaysAgo` back-dates each version's batch so the trend spreads
 * over time (do NOT rely on `defaultNow` — skill note, `drizzle-orm-patterns`).
 */
export interface GoldsetVersion {
  version: number;
  systemPrompt: string;
  ranAtDaysAgo: number;
}

export const GOLDSET_VERSIONS: readonly GoldsetVersion[] = [
  {
    version: 1,
    systemPrompt: 'You are a reviewer. Be brief.',
    ranAtDaysAgo: 20,
  },
  {
    version: 2,
    systemPrompt:
      'You are a code reviewer. Report clear bugs and performance problems in the diff, and cite the file and line for each.',
    ranAtDaysAgo: 15,
  },
  {
    version: 3,
    systemPrompt:
      'You are a careful code reviewer. Report bugs, security issues, and performance problems that the changed lines evidence, citing file and line. Do not flag pure renames or formatting-only changes.',
    ranAtDaysAgo: 10,
  },
  {
    version: 4,
    systemPrompt:
      'You are a meticulous senior code reviewer. Flag every bug, security vulnerability, and performance regression that the changed lines evidence, citing the exact file and line. Never flag benign renames, whitespace-only changes, or added tests. Report nothing you cannot ground in the diff.',
    ranAtDaysAgo: 5,
  },
];

/** The pinned (current) version after seeding — the highest version snapshot. */
export const GOLDSET_PINNED_VERSION = GOLDSET_VERSIONS[GOLDSET_VERSIONS.length - 1]!.version;

// ---------------------------------------------------------------- Cases

type ExpectationKind = 'must_find' | 'must_not_flag';

export interface GoldsetCaseDef {
  name: string;
  kind: ExpectationKind;
  inputDiff: string;
  expected: EvalExpectedOutput;
}

/** Case names referenced by profiles / ad-hoc runs — kept as constants to avoid typos. */
export const CASE_N_PLUS_ONE = 'n-plus-one-users';
export const CASE_MISSING_AWAIT = 'missing-await-email';
export const CASE_SQL_CONCAT = 'sql-string-concat';
export const CASE_UNBOUNDED_SCAN = 'unbounded-scan';
export const CASE_NULL_DEREF = 'null-deref-order';
export const CASE_BENIGN_RENAME = 'benign-rename';
export const CASE_WHITESPACE = 'whitespace-only';
export const CASE_ADDED_TEST = 'added-test-file';

/** The stable case (reproduces 5/5) and the flaky case (~2/5) — AC-17. */
export const GOLDSET_STABLE_CASE = CASE_N_PLUS_ONE;
export const GOLDSET_FLAKY_CASE = CASE_NULL_DEREF;

/** A minimal, valid unified-diff string for a case (illustrative; contains no secret). */
function diff(file: string, startLine: number, body: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${startLine},${body.length} +${startLine},${body.length} @@`,
    ...body,
  ].join('\n');
}

export const GOLDSET_CASES: readonly GoldsetCaseDef[] = [
  {
    name: CASE_N_PLUS_ONE,
    kind: 'must_find',
    inputDiff: diff('src/api/users.ts', 45, [
      '   const users = await listUsers();',
      '+  for (const u of users) {',
      '+    u.team = await db.team.findById(u.teamId);',
      '+  }',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_find',
          file: 'src/api/users.ts',
          start_line: 45,
          end_line: 52,
          severity: 'WARNING',
          category: 'perf',
          note: 'N+1 query: one team lookup per user in the loop.',
        },
      ],
    },
  },
  {
    name: CASE_MISSING_AWAIT,
    kind: 'must_find',
    inputDiff: diff('src/jobs/mailer.ts', 20, [
      '   const message = render(template, ctx);',
      '+  sendEmail(message);',
      '   return { queued: true };',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_find',
          file: 'src/jobs/mailer.ts',
          start_line: 20,
          end_line: 24,
          severity: 'WARNING',
          category: 'bug',
          note: 'sendEmail returns a promise that is never awaited.',
        },
      ],
    },
  },
  {
    name: CASE_SQL_CONCAT,
    kind: 'must_find',
    inputDiff: diff('src/db/query.ts', 8, [
      '-  const rows = await db.query(byIdStmt, [id]);',
      '+  const rows = await db.query(`SELECT * FROM users WHERE id = ${id}`);',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_find',
          file: 'src/db/query.ts',
          start_line: 8,
          end_line: 14,
          severity: 'CRITICAL',
          category: 'security',
          note: 'User input concatenated into SQL — injection risk.',
        },
      ],
    },
  },
  {
    name: CASE_UNBOUNDED_SCAN,
    kind: 'must_find',
    inputDiff: diff('src/util/scan.ts', 30, [
      '-  const items = await store.list({ limit: 100 });',
      '+  const items = await store.list();',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_find',
          file: 'src/util/scan.ts',
          start_line: 30,
          end_line: 40,
          severity: 'WARNING',
          category: 'perf',
          note: 'Removed the limit — this now scans the whole table.',
        },
      ],
    },
  },
  {
    name: CASE_NULL_DEREF,
    kind: 'must_find',
    inputDiff: diff('src/api/orders.ts', 12, [
      '   const order = await findOrder(id);',
      '+  return order.total.toFixed(2);',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_find',
          file: 'src/api/orders.ts',
          start_line: 12,
          end_line: 16,
          severity: 'WARNING',
          category: 'bug',
          note: 'order may be null when not found — possible null dereference.',
        },
      ],
    },
  },
  {
    name: CASE_BENIGN_RENAME,
    kind: 'must_not_flag',
    inputDiff: diff('src/models/user.ts', 5, [
      '-  const usr = buildUser(row);',
      '+  const user = buildUser(row);',
      '-  return usr;',
      '+  return user;',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_not_flag',
          file: 'src/models/user.ts',
          start_line: 5,
          end_line: 9,
          severity: 'SUGGESTION',
          category: 'style',
          note: 'A local variable rename with no behaviour change — must not be flagged.',
        },
      ],
    },
  },
  {
    name: CASE_WHITESPACE,
    kind: 'must_not_flag',
    inputDiff: diff('src/index.ts', 1, [
      '-import {createApp} from "./app";',
      '+import { createApp } from "./app";',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_not_flag',
          file: 'src/index.ts',
          start_line: 1,
          end_line: 3,
          severity: 'SUGGESTION',
          category: 'style',
          note: 'Whitespace-only formatting change — must not be flagged.',
        },
      ],
    },
  },
  {
    name: CASE_ADDED_TEST,
    kind: 'must_not_flag',
    inputDiff: diff('test/orders.test.ts', 1, [
      '+import { describe, it, expect } from "vitest";',
      '+describe("orders", () => {',
      '+  it("totals an order", () => expect(total([])).toBe(0));',
      '+});',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_not_flag',
          file: 'test/orders.test.ts',
          start_line: 1,
          end_line: 20,
          severity: 'SUGGESTION',
          category: 'test',
          note: 'A newly added test file — must not be flagged as a problem.',
        },
      ],
    },
  },
];

// ---------------------------------------------------------------- Synthetic engine output

let findingSeq = 0;

/** Build a synthetic grounded finding (pure data; the seed never calls a model). */
function mkFinding(
  file: string,
  startLine: number,
  endLine: number,
  severity: Finding['severity'],
  category: Finding['category'],
  title: string,
): Finding {
  findingSeq += 1;
  return {
    id: `goldset-f${findingSeq}`,
    severity,
    category,
    title,
    file,
    start_line: startLine,
    end_line: endLine,
    rationale: 'Synthetic gold-set finding for the seeded eval history (no model was called).',
    confidence: 0.9,
  };
}

/** The correct finding for a `must_find` case — overlaps its expectation region → a match. */
function correctFinding(caseName: string): Finding {
  const c = caseByName(caseName);
  const e = c.expected.expectations[0]!;
  return mkFinding(
    e.file,
    e.start_line,
    e.end_line,
    e.severity ?? 'WARNING',
    e.category ?? 'bug',
    `Correctly flagged: ${caseName}`,
  );
}

/** A noise finding on a `must_find` case — same file, DISJOINT lines → matches nothing (a FP). */
function noiseFinding(caseName: string): Finding {
  const c = caseByName(caseName);
  const e = c.expected.expectations[0]!;
  const start = e.end_line + 40;
  return mkFinding(e.file, start, start + 1, 'SUGGESTION', 'style', `Spurious note on ${caseName}`);
}

/** A forbidden finding on a `must_not_flag` case — overlaps its region → a false positive. */
function forbiddenFinding(caseName: string): Finding {
  const c = caseByName(caseName);
  const e = c.expected.expectations[0]!;
  return mkFinding(
    e.file,
    e.start_line,
    e.end_line,
    e.severity ?? 'SUGGESTION',
    e.category ?? 'style',
    `Over-flagged: ${caseName}`,
  );
}

function caseByName(name: string): GoldsetCaseDef {
  const c = GOLDSET_CASES.find((x) => x.name === name);
  if (!c) throw new Error(`Unknown gold-set case: ${name}`);
  return c;
}

/**
 * Per-version quality profile. As the prompt improves the agent finds more
 * `must_find` cases, stops over-flagging `must_not_flag` cases, and emits less
 * ungrounded noise — so recall/precision/citation climb v1→v4.
 */
interface VersionProfile {
  version: number;
  /** `must_find` cases the agent correctly finds. */
  finds: string[];
  /** `must_find` cases where the agent emits a non-matching (noise) finding. */
  noisy: string[];
  /** `must_not_flag` cases the agent wrongly flags (forbidden hit). */
  falseFlags: string[];
  /** Ungrounded findings the gate dropped on each noisy case (citation denominator). */
  droppedPerNoisyCase: number;
}

const PROFILES: readonly VersionProfile[] = [
  {
    version: 1,
    finds: [CASE_N_PLUS_ONE],
    noisy: [CASE_MISSING_AWAIT],
    falseFlags: [CASE_BENIGN_RENAME, CASE_WHITESPACE],
    droppedPerNoisyCase: 2,
  },
  {
    version: 2,
    finds: [CASE_N_PLUS_ONE, CASE_MISSING_AWAIT],
    noisy: [CASE_SQL_CONCAT],
    falseFlags: [CASE_BENIGN_RENAME],
    droppedPerNoisyCase: 1,
  },
  {
    version: 3,
    finds: [CASE_N_PLUS_ONE, CASE_MISSING_AWAIT, CASE_SQL_CONCAT, CASE_UNBOUNDED_SCAN],
    noisy: [],
    falseFlags: [],
    droppedPerNoisyCase: 0,
  },
  {
    version: 4,
    finds: [
      CASE_N_PLUS_ONE,
      CASE_MISSING_AWAIT,
      CASE_SQL_CONCAT,
      CASE_UNBOUNDED_SCAN,
      CASE_NULL_DEREF,
    ],
    noisy: [],
    falseFlags: [],
    droppedPerNoisyCase: 0,
  },
];

/**
 * The scorer inputs for every case at a given agent version — one `BatchCase` per
 * gold-set case, ready for `scoreBatch`/`scoreCase`. Deriving these from the
 * profile (rather than a hand-typed metric) is what makes the seeded batch numbers
 * REAL scorer output (AC-26): the seed and the goldset test both call this, so the
 * stored metrics provably equal `scoreBatch()` over the identical fixtures.
 */
export function goldsetBatchInputs(version: number): BatchCase[] {
  const profile = PROFILES.find((p) => p.version === version);
  if (!profile) throw new Error(`No gold-set profile for version ${version}`);
  return GOLDSET_CASES.map((c): BatchCase => {
    const grounded: Finding[] = [];
    if (c.kind === 'must_find') {
      if (profile.finds.includes(c.name)) grounded.push(correctFinding(c.name));
      if (profile.noisy.includes(c.name)) grounded.push(noiseFinding(c.name));
    } else if (profile.falseFlags.includes(c.name)) {
      grounded.push(forbiddenFinding(c.name));
    }
    const dropped = profile.noisy.includes(c.name) ? profile.droppedPerNoisyCase : 0;
    return {
      name: c.name,
      expectations: c.expected.expectations,
      grounded,
      producedCount: grounded.length + dropped,
    };
  });
}

/** One ad-hoc (batch-less) run outcome: exactly the inputs `scoreCase` needs. */
export interface AdhocRunInput {
  expectations: BatchCase['expectations'];
  grounded: Finding[];
  producedCount: number;
}

/**
 * The five ad-hoc "Run 5×" outcomes seeded for a case at the pinned version
 * (AC-17). The stable case reproduces 5/5 (always found); the flaky case ~2/5
 * (found twice, missed three times) — modelling LLM non-determinism without a
 * live run. Both are `must_find` cases, so a "found" run carries the correct
 * finding and a "missed" run carries nothing.
 */
export function goldsetAdhocInputs(caseName: string): AdhocRunInput[] {
  const c = caseByName(caseName);
  const found: AdhocRunInput = {
    expectations: c.expected.expectations,
    grounded: [correctFinding(caseName)],
    producedCount: 1,
  };
  const missed: AdhocRunInput = {
    expectations: c.expected.expectations,
    grounded: [],
    producedCount: 0,
  };
  if (caseName === GOLDSET_STABLE_CASE) return [found, found, found, found, found];
  if (caseName === GOLDSET_FLAKY_CASE) return [found, missed, found, missed, missed];
  throw new Error(`No ad-hoc profile for case ${caseName}`);
}
