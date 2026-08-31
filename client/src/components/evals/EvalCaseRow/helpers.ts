/* EvalCaseRow/helpers.ts — pure derivations for a single case row. */
import { EvalExpectedOutput, type EvalExpectedFinding } from "@devdigest/shared";

/** Parse the untyped `expected_output` (unknown on the wire) into expectations,
    degrading to [] on malformed data — never throws (zod safeParse at the boundary;
    the JSON is validated DATA, never executed — security). */
export function parseExpectations(raw: unknown): EvalExpectedFinding[] {
  const parsed = EvalExpectedOutput.safeParse(raw);
  return parsed.success ? parsed.data.expectations : [];
}

/** A compact "file:start-end" (or "file:line") reference for the first expectation. */
export function primaryRef(expectations: readonly EvalExpectedFinding[]): string | null {
  const first = expectations[0];
  if (!first) return null;
  return first.start_line === first.end_line
    ? `${first.file}:${first.start_line}`
    : `${first.file}:${first.start_line}-${first.end_line}`;
}

/** The distinct expectation kinds present, in first-seen order (for the badges). */
export function distinctKinds(
  expectations: readonly EvalExpectedFinding[],
): EvalExpectedFinding["kind"][] {
  return Array.from(new Set(expectations.map((e) => e.kind)));
}

/** "severity · category" for the first expectation, or null when neither is set. */
export function metaLine(expectations: readonly EvalExpectedFinding[]): string | null {
  const first = expectations[0];
  if (!first) return null;
  const parts = [first.severity, first.category].filter(
    (p): p is NonNullable<typeof p> => p != null,
  );
  return parts.length ? parts.join(" · ") : null;
}

/** The recall of a skill run's with/without ablation. */
export interface SkillPair {
  withRecall: number;
  withoutRecall: number;
}

/** Read the { with, without } payload a SKILL run stores in `actual_output` (a skill
    case is run twice — with the skill injected and without). Returns null for agent
    runs (whose `actual_output` is a plain grounded-finding array) or malformed data —
    never throws; the payload is validated DATA, never executed (security). */
export function readSkillPair(actualOutput: unknown): SkillPair | null {
  if (!actualOutput || typeof actualOutput !== "object" || Array.isArray(actualOutput)) return null;
  const o = actualOutput as { with?: unknown; without?: unknown };
  const wr = recallOf(o.with);
  const wor = recallOf(o.without);
  if (wr == null || wor == null) return null;
  return { withRecall: wr, withoutRecall: wor };
}

function recallOf(side: unknown): number | null {
  if (!side || typeof side !== "object") return null;
  const r = (side as { recall?: unknown }).recall;
  return typeof r === "number" && Number.isFinite(r) ? r : null;
}
