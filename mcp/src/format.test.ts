import { describe, expect, it } from 'vitest';
import {
  MAX_SNIPPET_CHARS,
  agentsMarkdown,
  conventionsMarkdown,
  findingsMarkdown,
  foldLines,
  projectFindings,
  reviewMarkdown,
  toAgentSummary,
  toConciseFinding,
  toConventionSummary,
  toFullFinding,
  truncationHint,
} from './format.js';
import type { Agent, ConventionCandidate, FindingRecord, FindingsResult } from './types.js';

const finding = (over: Partial<FindingRecord> = {}): FindingRecord => ({
  id: 'f-1',
  review_id: 'r-1',
  accepted_at: null,
  dismissed_at: null,
  severity: 'CRITICAL',
  category: 'security',
  title: 'Unbounded query',
  file: 'src/db/users.ts',
  start_line: 42,
  end_line: 58,
  rationale: 'No `.limit()` — a large table exhausts memory.',
  suggestion: 'Add `.limit(100)`.',
  confidence: 0.9,
  kind: 'finding',
  ...over,
});

const agent: Agent = {
  id: 'a-1',
  name: 'Security',
  description: 'Security reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: 'A MULTI-KILOBYTE PROMPT THAT MUST NEVER REACH THE MODEL CONTEXT',
  enabled: true,
  version: 3,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
};

const convention: ConventionCandidate = {
  id: 'c-1',
  rule: 'Repositories return row types, never Drizzle builders.',
  evidence_path: 'src/modules/agents/repository.ts',
  evidence_snippet: 'x'.repeat(500),
  evidence_sha: 'deadbeef',
  confidence: 0.8,
  accepted: true,
};

describe('ConciseFinding (§5.6)', () => {
  it('drops id, review_id, accepted_at, dismissed_at, kind — and the raw line pair', () => {
    const projected = toConciseFinding(finding());
    expect(Object.keys(projected).sort()).toEqual([
      'category',
      'file',
      'lines',
      'severity',
      'title',
    ]);
    for (const dropped of [
      'id',
      'review_id',
      'accepted_at',
      'dismissed_at',
      'kind',
      'start_line',
      'end_line',
      'rationale',
      'suggestion',
    ]) {
      expect(projected).not.toHaveProperty(dropped);
    }
  });

  it('folds start_line/end_line into one `lines` field', () => {
    expect(foldLines(42, 58)).toBe('42-58');
    expect(foldLines(42, 42)).toBe('42');
    expect(toConciseFinding(finding()).lines).toBe('42-58');
    expect(toConciseFinding(finding({ end_line: 42 })).lines).toBe('42');
  });
});

describe('FullFinding', () => {
  it('adds only confidence, rationale and suggestion — still no ids', () => {
    const full = toFullFinding(finding());
    expect(Object.keys(full).sort()).toEqual([
      'category',
      'confidence',
      'file',
      'lines',
      'rationale',
      'severity',
      'suggestion',
      'title',
    ]);
    expect(toFullFinding(finding({ suggestion: null })).suggestion).toBeNull();
    expect(toFullFinding(finding({ suggestion: undefined })).suggestion).toBeNull();
  });
});

describe('truncationHint', () => {
  it('appears IFF total > limit, and names the tool + the limit to retry with', () => {
    expect(truncationHint(20, 47, 'findings', 'get_findings')).toBe(
      'Showing 20 of 47 findings. Call get_findings again with limit=47 for the rest.',
    );
    expect(truncationHint(20, 20, 'findings', 'get_findings')).toBeNull();
    expect(truncationHint(20, 3, 'findings', 'get_findings')).toBeNull();
  });

  it('never suggests a limit the API would reject (max 50)', () => {
    expect(truncationHint(20, 120, 'findings', 'get_findings')).toContain('limit=50');
  });
});

describe('projectFindings', () => {
  it('caps at the limit and honours `detail`', () => {
    const findings = [finding(), finding({ id: 'f-2' }), finding({ id: 'f-3' })];
    expect(projectFindings(findings, 'concise', 2)).toHaveLength(2);
    expect(projectFindings(findings, 'concise', 2)[0]).not.toHaveProperty('rationale');
    expect(projectFindings(findings, 'full', 2)[0]).toHaveProperty('rationale');
  });
});

describe('agents & conventions projections', () => {
  it('strips the multi-KB system_prompt (the biggest bloat source in the surface)', () => {
    const summary = toAgentSummary(agent);
    expect(Object.keys(summary).sort()).toEqual([
      'description',
      'enabled',
      'id',
      'model',
      'name',
    ]);
    expect(JSON.stringify(summary)).not.toContain('MULTI-KILOBYTE');
  });

  it('strips id/evidence_sha and truncates the raw-blob snippet to 200 chars', () => {
    const summary = toConventionSummary(convention);
    expect(summary).not.toHaveProperty('id');
    expect(summary).not.toHaveProperty('evidence_sha');
    expect(summary.evidence_snippet.length).toBe(MAX_SNIPPET_CHARS + 1); // + the ellipsis
    expect(summary.evidence_snippet.endsWith('…')).toBe(true);
    expect(toConventionSummary({ ...convention, evidence_snippet: 'short' }).evidence_snippet).toBe(
      'short',
    );
  });
});

describe('the markdown `content` block is a SUMMARY, never JSON.stringify', () => {
  const result: FindingsResult = {
    run_id: 'run-1',
    verdict: 'request_changes',
    score: 42,
    summary: 'Two blockers in the query layer.',
    findings: [toConciseFinding(finding())],
    total_findings: 47,
    next: truncationHint(1, 47, 'findings', 'get_findings'),
  };

  it('emits no JSON object syntax (emitting the payload twice doubles the token cost)', () => {
    for (const md of [
      reviewMarkdown(result),
      findingsMarkdown(result.findings, 'Findings:', null),
      agentsMarkdown([toAgentSummary(agent)]),
      conventionsMarkdown('acme/payments-api', [toConventionSummary(convention)], null),
    ]) {
      expect(md).not.toContain('{"');
      expect(md).not.toContain('":');
      expect(md).not.toBe(JSON.stringify(result));
    }
  });

  it('carries the verdict, the finding and the truncation hint in readable prose', () => {
    const md = reviewMarkdown(result);
    expect(md).toContain('request_changes');
    expect(md).toContain('CRITICAL');
    expect(md).toContain('src/db/users.ts:42-58');
    expect(md).toContain('Showing 1 of 47 findings');
  });

  it('says so explicitly when a clean review has no findings', () => {
    expect(findingsMarkdown([], 'Findings:', null)).toContain('no findings');
  });
});
