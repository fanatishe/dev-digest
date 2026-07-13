import type { ProposedSplit, SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classifier.js';
import {
  GROUP_ORDER,
  SPLIT_TOO_BIG_FILES,
  SPLIT_TOO_BIG_LINES,
  SUMMARY_MAX_LEN,
  SUMMARY_MAX_LINE_LEN,
  SUMMARY_MAX_PATCH_LINES,
  SUMMARY_MAX_SYMBOLS,
  SUMMARY_PREFIX,
  SYMBOL_PATTERNS,
  SYMBOL_STOP_WORDS,
} from './classifier.constants.js';

/**
 * Smart Diff — the pure builder. NO LLM, NO I/O, NO container, NO Drizzle, NO
 * Fastify. It takes plain data in and returns the `SmartDiff` contract shape.
 *
 * Inputs are STRUCTURAL, not row types: the route can hand `pr_files` rows and
 * a mapped finding shape straight in with no cast, and this file stays unit
 * testable with no DB (the domain ring).
 */

/** The shape the route passes in — structurally satisfied by a `pr_files` row. */
export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/** Findings anchor on `startLine`, a NEW-file (RIGHT-side) line number. */
export interface SmartDiffInputFinding {
  file: string;
  startLine: number;
}

// ---- pseudocode summary ---------------------------------------------------

/**
 * Derive a one-line "what changed here" from the patch, DETERMINISTICALLY —
 * no model call. Scans the ADDED (`+`) lines for declared symbols and renders
 * e.g. `"Changed: rateLimit(), bucketKey()"`.
 *
 * Returns `null` when nothing is extractable (the contract field is `nullish`,
 * and an empty string would render as a blank line in the UI).
 *
 * SECURITY: the patch is attacker-authored. Every loop here is bounded —
 * SUMMARY_MAX_PATCH_LINES lines scanned, lines longer than SUMMARY_MAX_LINE_LEN
 * skipped (a minified bundle is one enormous line), at most SUMMARY_MAX_SYMBOLS
 * symbols collected, and the result hard-capped at SUMMARY_MAX_LEN chars.
 */
export function deriveSummary(patch: string | null): string | null {
  if (!patch) return null;

  const names: string[] = [];
  const seen = new Set<string>();
  const lines = patch.split('\n');
  const scanned = Math.min(lines.length, SUMMARY_MAX_PATCH_LINES);

  for (let i = 0; i < scanned && names.length < SUMMARY_MAX_SYMBOLS; i++) {
    const line = lines[i]!;
    // Added lines only. `+++ b/path` is a file header, not code.
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const content = line.slice(1);
    if (content.length > SUMMARY_MAX_LINE_LEN) continue;
    const trimmed = content.trim();
    if (trimmed.length === 0) continue;

    for (const { re, callable } of SYMBOL_PATTERNS) {
      const match = re.exec(trimmed);
      const name = match?.[1];
      if (!name) continue;
      if (SYMBOL_STOP_WORDS.has(name)) break;
      const rendered = callable ? `${name}()` : name;
      if (!seen.has(rendered)) {
        seen.add(rendered);
        names.push(rendered);
      }
      break; // first matching pattern wins for this line
    }
  }

  if (names.length === 0) return null;
  const summary = `${SUMMARY_PREFIX}${names.join(', ')}`;
  return summary.length > SUMMARY_MAX_LEN
    ? `${summary.slice(0, SUMMARY_MAX_LEN - 1).trimEnd()}…`
    : summary;
}

// ---- the builder ----------------------------------------------------------

/** Unique, ascending finding lines per file path. */
function findingLinesByPath(findings: readonly SmartDiffInputFinding[]): Map<string, number[]> {
  const byPath = new Map<string, Set<number>>();
  for (const f of findings) {
    const bucket = byPath.get(f.file) ?? new Set<number>();
    bucket.add(f.startLine);
    byPath.set(f.file, bucket);
  }
  const out = new Map<string, number[]>();
  for (const [path, lines] of byPath) {
    out.set(path, [...lines].sort((a, b) => a - b));
  }
  return out;
}

function changedLines(f: SmartDiffFile): number {
  return f.additions + f.deletions;
}

/**
 * Within a group: files WITH findings first (that is the whole point of the
 * regrouping — put what the reviewer flagged in front of you), then biggest
 * change first. Ties broken by path so the response is deterministic.
 */
function compareFiles(a: SmartDiffFile, b: SmartDiffFile): number {
  const aFlagged = a.finding_lines.length > 0 ? 0 : 1;
  const bFlagged = b.finding_lines.length > 0 ? 0 : 1;
  if (aFlagged !== bFlagged) return aFlagged - bFlagged;
  const size = changedLines(b) - changedLines(a);
  if (size !== 0) return size;
  return a.path.localeCompare(b.path);
}

/**
 * Regroup a PR's files by role and attach the latest review's finding lines.
 * Group order is core → wiring → boilerplate; EMPTY groups are omitted (a
 * zero-file group renders as noise).
 *
 * `split_suggestion` is ALWAYS emitted — the contract object is non-nullable,
 * so `too_big: false` still carries `total_lines` and `proposed_splits`.
 */
export function buildSmartDiff(
  files: readonly SmartDiffInputFile[],
  findings: readonly SmartDiffInputFinding[],
): SmartDiff {
  const lines = findingLinesByPath(findings);

  // ONE ENTRY PER PATH. `pr_files` has no UNIQUE (pr_id, path) constraint, and an
  // older racy DELETE-then-INSERT mirror left duplicate rows in existing databases.
  // A duplicated path here would emit two SmartDiffFile entries with the same
  // `path`, which is the React key the viewer renders by — a hard crash in the UI.
  // The write path is serialized now; this keeps a bad row from ever reaching the
  // client. Last row wins, matching the read-side dedupe in `GET /pulls/:id`.
  const unique = [...new Map(files.map((f) => [f.path, f])).values()];

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const file of unique) {
    const role = classifyFile(file.path);
    const entry: SmartDiffFile = {
      path: file.path,
      pseudocode_summary: deriveSummary(file.patch),
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: lines.get(file.path) ?? [],
    };
    const bucket = byRole.get(role) ?? [];
    bucket.push(entry);
    byRole.set(role, bucket);
  }

  const groups: SmartDiffGroup[] = [];
  const proposed_splits: ProposedSplit[] = [];
  for (const role of GROUP_ORDER) {
    const bucket = byRole.get(role);
    if (!bucket || bucket.length === 0) continue; // empty groups are omitted
    bucket.sort(compareFiles);
    groups.push({ role, files: bucket });
    proposed_splits.push({ name: role, files: bucket.map((f) => f.path) });
  }

  const total_lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  return {
    groups,
    split_suggestion: {
      too_big: total_lines > SPLIT_TOO_BIG_LINES || files.length > SPLIT_TOO_BIG_FILES,
      total_lines,
      proposed_splits,
    },
  };
}
