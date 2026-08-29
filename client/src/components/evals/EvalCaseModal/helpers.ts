/* Pure helpers for the EvalCaseModal — derivation of the seeded case + JSON
   validation. No I/O, no React. The expected-output editor text is parsed with
   JSON.parse (wrapped, never eval) and validated against the EvalExpectedOutput
   contract, so malformed input can only ever disable Save — never crash (AC-4). */

import { EvalExpectedOutput } from "@devdigest/shared";
import type {
  EvalExpectedFinding,
  EvalExpectedOutput as EvalExpectedOutputType,
  FindingRecord,
  PrDetail,
} from "@devdigest/shared";

export type ExpectationKind = EvalExpectedFinding["kind"];

/** An accepted (or not-yet-actioned) finding asserts must_find; a dismissed one
 *  asserts must_not_flag (AC-1). */
export function deriveKind(f: Pick<FindingRecord, "dismissed_at">): ExpectationKind {
  return f.dismissed_at ? "must_not_flag" : "must_find";
}

/** The single expectation the modal seeds from a finding (AC-1). */
export function deriveExpectation(f: FindingRecord): EvalExpectedFinding {
  return {
    kind: deriveKind(f),
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    severity: f.severity,
    category: f.category,
    note: f.title,
  };
}

/** The initial expected-output document (one expectation for a finding, empty for
 *  a blank create). */
export function initialExpectedOutput(f: FindingRecord | null | undefined): EvalExpectedOutputType {
  return { expectations: f ? [deriveExpectation(f)] : [] };
}

/** A valid EvalExpectedFinding stub inserted by "+ Finding skeleton" (AC-4). */
export function findingSkeleton(): EvalExpectedFinding {
  return { kind: "must_find", file: "src/example.ts", start_line: 1, end_line: 1 };
}

export function stringifyExpected(out: EvalExpectedOutputType): string {
  return JSON.stringify(out, null, 2);
}

export type ParseResult =
  | { ok: true; value: EvalExpectedOutputType }
  | { ok: false };

/** Parse editor text as a valid EvalExpectedOutput. Never throws, never evals. */
export function parseExpected(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const parsed = EvalExpectedOutput.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}

/** Append a fresh skeleton, preserving any already-valid expectations; always
 *  returns valid JSON so the badge flips to valid and Save enables (AC-4). */
export function withSkeleton(text: string): string {
  const parsed = parseExpected(text);
  const base = parsed.ok ? parsed.value.expectations : [];
  return stringifyExpected({ expectations: [...base, findingSkeleton()] });
}

/** The diff patch for the finding's file (falls back to every patch joined). */
export function seedDiff(detail: PrDetail | undefined, file?: string): string {
  if (!detail) return "";
  const match = file ? detail.files.find((pf) => pf.path === file) : undefined;
  if (match?.patch) return match.patch;
  return detail.files
    .map((pf) => pf.patch ?? "")
    .filter(Boolean)
    .join("\n\n");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Default case name seeded from the finding (AC-1/AC-2). */
export function seedName(f: FindingRecord | null | undefined): string {
  if (!f) return "";
  const prefix = deriveKind(f) === "must_find" ? "must-find" : "must-not-flag";
  return `${prefix}-${slugify(f.title)}`;
}

/** "file:line" (or "file:start-end") reference for the expectation caption. */
export function lineRef(f: Pick<FindingRecord, "file" | "start_line" | "end_line">): string {
  const line = f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
  return `${f.file}:${line}`;
}
