import type { EvalExpectedOutput, Finding } from '@devdigest/shared';
import type { EvalExpectedFinding } from '@devdigest/shared';

/**
 * Synthetic SKILL eval gold-set (L06) — the no-key demo data for the SkillEditor
 * Evals tab's "With skill / Without skill" comparison.
 *
 * A skill eval case is run TWICE — once WITH the skill's body injected and once
 * WITHOUT it — so the tab can show the skill's marginal value. This module is PURE
 * DATA + PURE DERIVATION: for each case it carries the synthetic engine output for
 * both sides; the seed feeds each side to the pure scorer (`scoreCase`, zero LLM) and
 * stores the paired result in `eval_runs.actual_output` (`{ with, without }`), with
 * the scalar columns holding the WITH-skill numbers.
 *
 * Security (skill note): everything here is DATA — tiny illustrative diffs and
 * expected records. No secret/key/credential ever appears.
 */

/** The seeded skill these cases attach to (by name — matches db/seed.ts). */
export const SKILL_GOLDSET_SKILL_NAME = 'breaking-change';

function diff(file: string, startLine: number, body: string[]): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${startLine},${body.length} +${startLine},${body.length} @@`,
    ...body,
  ].join('\n');
}

let seq = 0;
function mkFinding(e: EvalExpectedFinding, title: string): Finding {
  seq += 1;
  return {
    id: `skill-goldset-f${seq}`,
    severity: e.severity ?? 'CRITICAL',
    category: e.category ?? 'security',
    title,
    file: e.file,
    start_line: e.start_line,
    end_line: e.end_line,
    rationale: 'Synthetic skill gold-set finding (no model was called).',
    confidence: 0.9,
  };
}

export interface SkillGoldsetCase {
  name: string;
  inputDiff: string;
  expected: EvalExpectedOutput;
  /** Findings the WITH-skill run grounds (the skill catches the issue). */
  withGrounded: (e: EvalExpectedFinding) => Finding[];
  /** Findings the WITHOUT-skill run grounds (the ablated run misses/over-flags). */
  withoutGrounded: (e: EvalExpectedFinding) => Finding[];
}

const found = (e: EvalExpectedFinding): Finding[] => [mkFinding(e, `Flagged: ${e.file}`)];
const none = (): Finding[] => [];

/**
 * Four cases mirroring the SkillEditor Evals tab demo: two `must_find` cases where the
 * skill is what makes the reviewer catch the issue (with 100% / without 0%), and two
 * `must_not_flag` cases that stay clean either way (with 100% / without 100%).
 */
export const SKILL_GOLDSET_CASES: readonly SkillGoldsetCase[] = [
  {
    name: 'breaking-change-gate-additive-optional-field-not-flagged',
    inputDiff: diff('src/api/user.ts', 3, [
      '   type UserResponse = {',
      '     id: string;',
      '+    email?: string;',
      '   };',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_not_flag',
          file: 'src/api/user.ts',
          start_line: 3,
          end_line: 7,
          severity: 'SUGGESTION',
          category: 'style',
          note: 'Adding an OPTIONAL field is backwards-compatible — must not be flagged.',
        },
      ],
    },
    withGrounded: none,
    withoutGrounded: none,
  },
  {
    name: 'breaking-change-gate-field-removal-is-flagged',
    inputDiff: diff('src/api/user.ts', 1, [
      '   type UserResponse = {',
      '     id: string;',
      '-    name: string;',
      '-    email?: string;',
      '   };',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_find',
          file: 'src/api/user.ts',
          start_line: 1,
          end_line: 6,
          severity: 'CRITICAL',
          category: 'security',
          note: "Public fields 'name'/'email' removed without a version bump — breaking.",
        },
      ],
    },
    withGrounded: found,
    withoutGrounded: none,
  },
  {
    name: 'adversarial-suppress-positive',
    inputDiff: diff('src/api/order.ts', 10, [
      '   export type OrderResponse = {',
      '-    total: number;',
      '   };',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_find',
          file: 'src/api/order.ts',
          start_line: 10,
          end_line: 13,
          severity: 'CRITICAL',
          category: 'security',
          note: "Removing the public 'total' field is a breaking change.",
        },
      ],
    },
    withGrounded: found,
    withoutGrounded: none,
  },
  {
    name: 'adversarial-hallucinate-negative',
    inputDiff: diff('src/api/order.ts', 20, [
      '   // rename a LOCAL variable only',
      '-  const resp = build();',
      '+  const response = build();',
    ]),
    expected: {
      expectations: [
        {
          kind: 'must_not_flag',
          file: 'src/api/order.ts',
          start_line: 20,
          end_line: 23,
          severity: 'SUGGESTION',
          category: 'style',
          note: 'A local rename changes no public contract — must not be flagged.',
        },
      ],
    },
    withGrounded: none,
    withoutGrounded: none,
  },
];

/** The two synthetic engine outputs (with/without the skill) for a case's single expectation. */
export function skillGoldsetSides(c: SkillGoldsetCase): {
  expectations: EvalExpectedFinding[];
  withGrounded: Finding[];
  withoutGrounded: Finding[];
} {
  const e = c.expected.expectations[0]!;
  return {
    expectations: c.expected.expectations,
    withGrounded: c.withGrounded(e),
    withoutGrounded: c.withoutGrounded(e),
  };
}
