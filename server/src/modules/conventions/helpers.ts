import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from './repository.js';

/**
 * Pure helpers for the conventions extractor — no container, no I/O — so the
 * evidence-verification gate and skill-body rendering are unit-testable in
 * isolation. The service composes these with the model + repository.
 */

/** Lines of code captured as a candidate's evidence snippet (from the cited line). */
export const SNIPPET_LINES = 3;
/** Cap per-file content sent to the model so a huge file can't blow the budget. */
export const MAX_FILE_LINES = 200;

/** One sampled file: its path + the raw content we read from the clone. */
export interface Sample {
  path: string;
  content: string;
}

/** A raw candidate as returned by the model (before evidence verification). */
export interface RawCandidate {
  category: string;
  rule: string;
  evidence: { file: string; line: number };
  confidence: number;
}

/** A verified candidate ready to persist (evidence resolved to a real snippet). */
export interface VerifiedCandidate {
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  confidence: number;
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function toCandidate(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_sha: row.evidenceSha ?? null,
    confidence: clamp01(row.confidence ?? 0),
    accepted: row.accepted,
  };
}

/**
 * Code-level evidence check. Returns a persistable candidate ONLY when the cited
 * file was sampled AND the cited 1-based line exists and is non-blank; otherwise
 * null (the candidate is discarded). Captures the real source lines as the snippet.
 */
export function verifyEvidence(
  c: RawCandidate,
  byPath: Map<string, string>,
): VerifiedCandidate | null {
  if (!c.rule?.trim()) return null;
  const content = byPath.get(c.evidence?.file);
  if (content == null) return null;
  const lines = content.split('\n');
  const line = c.evidence.line;
  if (!Number.isInteger(line) || line < 1 || line > lines.length) return null;
  const end = Math.min(lines.length, line + SNIPPET_LINES - 1);
  const snippet = lines.slice(line - 1, end).join('\n');
  if (snippet.trim() === '') return null;
  const evidencePath = end > line ? `${c.evidence.file}:${line}-${end}` : `${c.evidence.file}:${line}`;
  return {
    rule: c.rule.trim(),
    evidencePath,
    evidenceSnippet: snippet,
    confidence: clamp01(c.confidence),
  };
}

/** Render the sampled files with 1-based line numbers so the model can cite lines. */
export function renderSamples(samples: Sample[]): string {
  const blocks = samples.map((s) => {
    const numbered = s.content
      .split('\n')
      .slice(0, MAX_FILE_LINES)
      .map((l, i) => `${i + 1}\t${l}`)
      .join('\n');
    return `=== FILE: ${s.path} ===\n${numbered}`;
  });
  return `Sampled files (line-numbered):\n\n${blocks.join('\n\n')}`;
}

/** Merge accepted conventions into a single skill markdown body (see screenshots). */
export function renderSkillBody(name: string, repoName: string, accepted: ConventionRow[]): string {
  const header = [
    `# ${name}`,
    '',
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite`,
    'the offending `file:line`.',
  ].join('\n');
  const sections = accepted.map((c) => {
    const parts = [`## ${slugify(c.rule)}`, c.rule];
    if (c.evidencePath) {
      parts.push('', `Detected in \`${c.evidencePath}\`:`);
      if (c.evidenceSnippet) parts.push('```', c.evidenceSnippet, '```');
    }
    return parts.join('\n');
  });
  return [header, ...sections].join('\n\n') + '\n';
}

export function slugify(rule: string): string {
  return (
    rule
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-')
      .slice(0, 6)
      .join('-') || 'rule'
  );
}
