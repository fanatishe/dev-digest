/**
 * DOMAIN ring — pure. Raw record → wire projection, and wire projection → the one
 * markdown `content` block that rides alongside `structuredContent`.
 *
 * The token rule (§5.6): a structured tool SHOULD also emit text — but emitting
 * `JSON.stringify(structuredContent)` as that text DOUBLES the token cost for zero
 * gain. So the text block here is always a concise human/model-readable summary.
 * `format.test.ts` asserts it contains no `{"`.
 */
import type {
  AgentSummary,
  ConciseFinding,
  ConventionSummary,
  FullFinding,
} from './schemas.js';
import type {
  Agent,
  ConventionCandidate,
  Detail,
  FindingRecord,
  ProjectedFinding,
  RunOnPrResult,
  FindingsResult,
} from './types.js';

/** `evidence_snippet` is a raw file blob — the only unbounded field in this surface. */
export const MAX_SNIPPET_CHARS = 200;

/** The API caps a page at 50; a hint must never suggest a limit the API will reject. */
export const MAX_LIMIT = 50;

export function truncate(text: string, max: number = MAX_SNIPPET_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/** `start_line` + `end_line` → one `lines` field: "42" or "42-58". */
export function foldLines(startLine: number, endLine: number): string {
  return endLine > startLine ? `${startLine}-${endLine}` : `${startLine}`;
}

// ---- Findings ------------------------------------------------------------------

export function toConciseFinding(f: FindingRecord): ConciseFinding {
  return {
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    lines: foldLines(f.start_line, f.end_line),
  };
}

export function toFullFinding(f: FindingRecord): FullFinding {
  return {
    ...toConciseFinding(f),
    confidence: f.confidence,
    rationale: f.rationale,
    suggestion: f.suggestion ?? null,
  };
}

export function projectFinding(f: FindingRecord, detail: Detail): ProjectedFinding {
  return detail === 'full' ? toFullFinding(f) : toConciseFinding(f);
}

/** Projects at most `limit` findings, newest-first order preserved. */
export function projectFindings(
  findings: readonly FindingRecord[],
  detail: Detail,
  limit: number,
): ProjectedFinding[] {
  return findings.slice(0, limit).map((f) => projectFinding(f, detail));
}

/**
 * "Showing 20 of 47 findings. Call get_findings again with limit=47 for the rest."
 * `null` when nothing was dropped — a hint that fires on a complete list is a lie
 * that costs a wasted call.
 */
export function truncationHint(
  shown: number,
  total: number,
  noun: string,
  tool: string,
): string | null {
  if (total <= shown) return null;
  const suggested = Math.min(total, MAX_LIMIT);
  return `Showing ${shown} of ${total} ${noun}. Call ${tool} again with limit=${suggested} for the rest.`;
}

// ---- Agents (§5.1) --------------------------------------------------------------

/** Strips `system_prompt` (multi-KB) and every field the model cannot act on. */
export function toAgentSummary(a: Agent): AgentSummary {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    model: a.model,
    enabled: a.enabled,
  };
}

// ---- Conventions (§5.4) ---------------------------------------------------------

/** Strips `id` and `evidence_sha`; truncates the raw-blob snippet. */
export function toConventionSummary(c: ConventionCandidate): ConventionSummary {
  return {
    rule: c.rule,
    evidence_path: c.evidence_path,
    evidence_snippet: truncate(c.evidence_snippet),
    confidence: c.confidence,
    accepted: c.accepted,
  };
}

// ---- Markdown `content` blocks — NEVER JSON.stringify ---------------------------

export function agentsMarkdown(agents: readonly AgentSummary[]): string {
  const lines = agents.map(
    (a) =>
      `- **${a.name}** (${a.model})${a.enabled ? '' : ' — disabled'} · id: ${a.id}\n  ${a.description}`,
  );
  return [`${agents.length} reviewer agent(s):`, ...lines].join('\n');
}

export function findingMarkdown(f: ProjectedFinding): string {
  const head = `- **${f.severity}** [${f.category}] ${f.title} — ${f.file}:${f.lines}`;
  if (!('rationale' in f)) return head;
  const suggestion = f.suggestion ? `\n  suggestion: ${f.suggestion}` : '';
  return `${head}\n  ${f.rationale}${suggestion}`;
}

export function findingsMarkdown(
  findings: readonly ProjectedFinding[],
  header: string,
  hint: string | null,
): string {
  const body =
    findings.length > 0 ? findings.map(findingMarkdown) : ['- (no findings — nothing flagged)'];
  return [header, ...body, ...(hint ? ['', hint] : [])].join('\n');
}

export function reviewMarkdown(r: RunOnPrResult | FindingsResult): string {
  const header = [
    `Verdict: ${r.verdict ?? 'n/a'} · score: ${r.score ?? 'n/a'} · ${r.total_findings} finding(s)`,
    r.summary ? `\n${r.summary}\n` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return findingsMarkdown(r.findings, header, r.next);
}

export function conventionsMarkdown(
  repoFullName: string,
  conventions: readonly ConventionSummary[],
  hint: string | null,
): string {
  const lines = conventions.map(
    (c) =>
      `- ${c.rule}${c.accepted ? ' (accepted)' : ''}\n  grounded in ${c.evidence_path}: ${c.evidence_snippet}`,
  );
  return [
    `${conventions.length} convention(s) extracted from ${repoFullName}:`,
    ...lines,
    ...(hint ? ['', hint] : []),
  ].join('\n');
}
