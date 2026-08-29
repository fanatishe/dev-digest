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
