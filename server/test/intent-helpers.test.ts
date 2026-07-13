import { describe, it, expect } from 'vitest';
import {
  derivedFromLabels,
  isSafeRepoPath,
  isStale,
  looksLikePlan,
  parseDocRefs,
  parseLinkedIssue,
  renderHeadersOnly,
  renderIntentBlock,
  renderIntentInput,
  type IntentSources,
} from '../src/modules/reviews/intent-helpers.js';
import { formatIntentReceipt } from '../src/modules/reviews/intent-service.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import type { Intent } from '@devdigest/shared';

/**
 * The Intent Layer's headline claim: the classifier sees PR METADATA + hunk
 * HEADERS ONLY — never the `+/-` diff bodies — and we can prove what that saved.
 * These are the pure helpers (no DB, no container, no network), so the claim is
 * checkable without Docker.
 */

const RAW_DIFF = `diff --git a/src/middleware/rate-limit.ts b/src/middleware/rate-limit.ts
--- a/src/middleware/rate-limit.ts
+++ b/src/middleware/rate-limit.ts
@@ -10,5 +10,8 @@
 export function rateLimit(app) {
-  const bucket = new Map();
+  const bucket = new TokenBucket({ capacity: 60, refillPerSec: 1 });
+  const adminBypassToken = "sk_live_do_not_leak_me";
+  app.decorate("rateLimit", bucket);
   return bucket;
 }
@@ -40,3 +43,4 @@
 const routes = [];
+routes.push("/public/webhooks");
 export default routes;
diff --git a/docs/plans/rate-limit.md b/docs/plans/rate-limit.md
--- a/docs/plans/rate-limit.md
+++ b/docs/plans/rate-limit.md
@@ -1,2 +1,4 @@
 # Rate limiting
+A token bucket on the public router.
+60 requests per minute per IP.
 Owner: platform`;

const DIFF = parseUnifiedDiff(RAW_DIFF);

describe('renderHeadersOnly — the +/- bodies are never rendered', () => {
  const rendered = renderHeadersOnly(DIFF);

  it('emits the changed file paths and their @@ hunk headers', () => {
    expect(rendered).toContain('src/middleware/rate-limit.ts');
    expect(rendered).toContain('docs/plans/rate-limit.md');
    expect(rendered).toContain('@@ -10,5 +10,8 @@');
    expect(rendered).toContain('@@ -40,3 +43,4 @@');
    expect(rendered).toContain('@@ -1,2 +1,4 @@');
  });

  it('contains NO diff body lines — not one added or removed line survives', () => {
    // The fixture really does carry bodies (otherwise this test proves nothing).
    expect(DIFF.raw).toContain('+  const adminBypassToken = "sk_live_do_not_leak_me";');
    expect(DIFF.raw).toContain('-  const bucket = new Map();');

    // …and none of them reach the classifier's input.
    expect(rendered).not.toContain('sk_live_do_not_leak_me');
    expect(rendered).not.toContain('TokenBucket');
    expect(rendered).not.toContain('new Map()');
    expect(rendered).not.toContain('/public/webhooks');

    // Structural form of the same claim: every rendered line is a file header or
    // an `@@` hunk header. A `+`/`-` body line cannot hide anywhere in here.
    for (const line of rendered.split('\n')) {
      const t = line.trim();
      expect(t.startsWith('+')).toBe(false);
      expect(t.startsWith('-')).toBe(false);
      expect(t.startsWith('@@') || /^\S.*\(\+\d+\/-\d+\)$/.test(t)).toBe(true);
    }
  });

  it('is dramatically cheaper than the full diff on the SAME tokenizer', () => {
    // The service's token receipt (`tokens_full` vs `tokens_headers`) counts
    // exactly these two strings with `container.tokenizer`. Same counter here.
    const tok = new TiktokenTokenizer();
    const full = tok.count(DIFF.raw);
    const headers = tok.count(rendered);
    expect(headers).toBeLessThan(full);
    expect(headers).toBeLessThan(full / 2);
  });
});

describe('parseLinkedIssue', () => {
  it('reads a bare #123', () => {
    expect(parseLinkedIssue('Rework the bucket, see #123 for context')).toBe(123);
  });

  it('reads the closing keywords', () => {
    expect(parseLinkedIssue('Fixes #123')).toBe(123);
    expect(parseLinkedIssue('Closes #45')).toBe(45);
    expect(parseLinkedIssue('resolved: #7')).toBe(7);
  });

  it('prefers the closing keyword over an incidental mention', () => {
    expect(parseLinkedIssue('Follow-up to #99.\n\nFixes #123')).toBe(123);
  });

  it('returns null for a body with no issue reference (and for no body at all)', () => {
    expect(parseLinkedIssue('Just a refactor of the token bucket.')).toBeNull();
    expect(parseLinkedIssue('')).toBeNull();
    expect(parseLinkedIssue(null)).toBeNull();
  });
});

describe('parseDocRefs — SSRF is the headline risk', () => {
  const repo = { owner: 'acme', name: 'payments-api' };

  it('puts in-repo relative doc paths in `inRepo`', () => {
    const refs = parseDocRefs('Plan: docs/plans/rate-limit.md and specs/api.md', repo);
    expect(refs.inRepo).toContain('docs/plans/rate-limit.md');
    expect(refs.inRepo).toContain('specs/api.md');
    expect(refs.external).toEqual([]);
  });

  it('resolves a GitHub blob URL pointing at THIS repo to its repo-relative path', () => {
    const refs = parseDocRefs(
      'Spec: https://github.com/acme/payments-api/blob/main/docs/plans/rate-limit.md',
      repo,
    );
    expect(refs.inRepo).toEqual(['docs/plans/rate-limit.md']);
    expect(refs.external).toEqual([]);
  });

  it('SECURITY: a cloud-metadata URL lands in `external` and NEVER in `inRepo`', () => {
    const refs = parseDocRefs(
      'See the plan at http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      repo,
    );
    expect(refs.external).toEqual([
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    ]);
    expect(refs.inRepo).toEqual([]);
  });

  it('SECURITY: a blob URL into a DIFFERENT repo stays external — it is not our clone', () => {
    const refs = parseDocRefs(
      'Context: https://github.com/evil/exfil/blob/main/docs/plans/steal.md and ' +
        'https://raw.githubusercontent.com/evil/exfil/main/secrets.md',
      repo,
    );
    expect(refs.inRepo).toEqual([]);
    expect(refs.external).toEqual([
      'https://github.com/evil/exfil/blob/main/docs/plans/steal.md',
      'https://raw.githubusercontent.com/evil/exfil/main/secrets.md',
    ]);
  });

  it('every path it hands back as in-repo is a safe repo path', () => {
    const refs = parseDocRefs(
      [
        'docs/plans/ok.md',
        '../../etc/passwd.md',
        'http://169.254.169.254/latest/meta-data/',
        'https://github.com/acme/payments-api/blob/main/docs/plans/ok2.md',
      ].join('\n'),
      repo,
    );
    expect(refs.inRepo.length).toBeGreaterThan(0);
    for (const p of refs.inRepo) expect(isSafeRepoPath(p)).toBe(true);
    expect(refs.inRepo).not.toContain('../../etc/passwd.md');
  });
});

describe('isSafeRepoPath — the only thing between a PR body and /etc/passwd', () => {
  it('accepts a plain relative repo path', () => {
    expect(isSafeRepoPath('docs/plans/rate-limit.md')).toBe(true);
    expect(isSafeRepoPath('README.md')).toBe(true);
  });

  it('rejects traversal, absolute, home-relative, windows and NUL-byte paths', () => {
    expect(isSafeRepoPath('../../etc/passwd')).toBe(false);
    expect(isSafeRepoPath('docs/../../../etc/passwd')).toBe(false);
    expect(isSafeRepoPath('/etc/passwd')).toBe(false);
    expect(isSafeRepoPath('~/.devdigest/secrets.json')).toBe(false);
    expect(isSafeRepoPath('C:\\Windows\\system32')).toBe(false);
    expect(isSafeRepoPath('docs\\plans\\x.md')).toBe(false);
    expect(isSafeRepoPath('docs/plans/\0x.md')).toBe(false);
    expect(isSafeRepoPath('')).toBe(false);
    expect(isSafeRepoPath(`docs/${'a'.repeat(300)}.md`)).toBe(false);
  });
});

// ---- the source ladder -----------------------------------------------------

const baseSources = (over: Partial<IntentSources> = {}): IntentSources => ({
  title: 'Add rate limiting to the public router',
  branch: 'feat/rate-limit-public',
  commits: ['add token bucket', 'wire bucket into public router', 'docs: plan'],
  headers: renderHeadersOnly(DIFF),
  ...over,
});

describe('renderIntentInput — an EMPTY PR body still yields an intent input', () => {
  it('carries title + branch + commit messages + changed files with no description at all', () => {
    const input = renderIntentInput(baseSources({ body: '' }));

    expect(input.trim()).not.toBe('');
    // Rungs 4-7 always exist. This IS the product requirement: no documentation
    // is perfectly fine — infer from whatever implicit signal exists.
    expect(input).toContain('Add rate limiting to the public router'); // title
    expect(input).toContain('feat/rate-limit-public'); // branch
    expect(input).toContain('add token bucket'); // commits
    expect(input).toContain('wire bucket into public router');
    expect(input).toContain('src/middleware/rate-limit.ts'); // changed files
    expect(input).toContain('@@ -10,5 +10,8 @@'); // hunk headers

    // …and the section that has nothing to say is simply absent.
    expect(input).not.toContain('## PR description');
    // Still no diff bodies, even here.
    expect(input).not.toContain('sk_live_do_not_leak_me');
  });

  it('records the degradation in derived_from: title/branch/commits/files, no pr_body', () => {
    expect(derivedFromLabels(baseSources({ body: '' }))).toEqual([
      'title',
      'branch',
      'commits',
      'files',
    ]);
  });

  it('a null body degrades the same way, it never throws', () => {
    expect(() => renderIntentInput(baseSources({ body: null }))).not.toThrow();
    expect(renderIntentInput(baseSources({ body: null, commits: [] }))).toContain('## PR title');
  });
});

describe('renderIntentInput — a plan/spec in the body reaches the model VERBATIM', () => {
  const PLAN = [
    '## Plan',
    '',
    'Add a token bucket (60 req/min per IP) to the public router only.',
    '',
    '### Acceptance criteria',
    '- [ ] `/public/*` is limited; `/internal/*` is NOT touched',
    '- [ ] 429 carries a Retry-After header',
  ].join('\n');

  it('passes the plan text through unsummarized, and flags it as a plan', () => {
    const sources = baseSources({ body: PLAN });
    expect(looksLikePlan(PLAN)).toBe(true);

    const input = renderIntentInput(sources);
    // VERBATIM: the whole block, byte-for-byte, not a paraphrase.
    expect(input).toContain(PLAN);
    expect(input).toContain('contains a plan/spec — read it verbatim');
    // Author-controlled text is fenced as untrusted DATA.
    expect(input).toContain('<untrusted source="pr-body">');
    expect(derivedFromLabels(sources)).toContain('pr_body');
  });

  it('renders linked docs and the issue, and lists external refs as UNRESOLVED (never fetched)', () => {
    const input = renderIntentInput(
      baseSources({
        body: 'Fixes #123. Plan: docs/plans/rate-limit.md',
        docs: [{ path: 'docs/plans/rate-limit.md', content: 'Token bucket on the public router.' }],
        issue: { number: 123, title: 'Public API has no rate limit', body: 'We get scraped.' },
        externalRefs: ['http://169.254.169.254/latest/meta-data/'],
      }),
    );
    expect(input).toContain('## Linked document: docs/plans/rate-limit.md');
    expect(input).toContain('Token bucket on the public router.');
    expect(input).toContain('#123 Public API has no rate limit');
    expect(input).toContain('## Unresolved external references (not fetched)');
    expect(input).toContain('http://169.254.169.254/latest/meta-data/');
  });
});

describe('renderIntentBlock — bare text; fencing and the scope rule live elsewhere', () => {
  const intent: Intent = {
    intent: 'Rate-limit the public router.',
    in_scope: ['public router middleware'],
    out_of_scope: ['internal router'],
    risk_areas: ['Public API surface'],
    derived_from: ['pr_body', 'issue #123'],
  };

  it('renders the intent, both scopes, risk areas and provenance', () => {
    const block = renderIntentBlock(intent);
    expect(block).toContain('Intent: Rate-limit the public router.');
    expect(block).toContain('In scope:\n- public router middleware');
    expect(block).toContain('Out of scope:\n- internal router');
    expect(block).toContain('Risk areas:\n- Public API surface');
    expect(block).toContain('Derived from: pr_body, issue #123');
  });

  it('does NOT self-fence (assemblePrompt wraps it — double-fencing would nest blocks)', () => {
    const block = renderIntentBlock(intent);
    expect(block).not.toContain('<untrusted');
    expect(block).not.toContain('</untrusted>');
  });

  it('does NOT carry the scope rule — a rule inside untrusted data is a rule ignored', () => {
    const block = renderIntentBlock(intent).toLowerCase();
    expect(block).not.toContain('prefer findings');
    expect(block).not.toContain('signal finding');
    expect(block).not.toContain('never waives');
  });

  it('omits empty/absent lists rather than emitting a dangling label', () => {
    const block = renderIntentBlock({
      intent: 'x',
      in_scope: [],
      out_of_scope: [],
      risk_areas: null,
      derived_from: null,
    });
    expect(block).toBe('Intent: x');
  });
});

describe('isStale — we do not cry wolf', () => {
  it('is true only when both shas are known and differ', () => {
    expect(isStale('aaa111', 'bbb222')).toBe(true);
    expect(isStale('aaa111', 'aaa111')).toBe(false);
  });

  it('is false when either side is unknown (a pre-sha row is not "stale")', () => {
    expect(isStale(null, 'bbb222')).toBe(false);
    expect(isStale('aaa111', null)).toBe(false);
    expect(isStale(undefined, undefined)).toBe(false);
    expect(isStale('', 'bbb222')).toBe(false);
  });
});

describe('formatIntentReceipt — automatic spend leaves an auditable line', () => {
  it('renders the provider-reported bill for the call', () => {
    expect(
      formatIntentReceipt(
        { tokensIn: 1204, tokensOut: 96, costUsd: 0.00021 },
        'deepseek/deepseek-v4-flash',
      ),
    ).toBe('Intent: 1,204 in / 96 out — $0.00021 (deepseek/deepseek-v4-flash)');
  });

  it('says "cost not reported" rather than inventing $0.00000', () => {
    // A provider that reported no usage is UNMEASURED, not free — and
    // `adapters/llm/pricing.ts` has drifted and silently lied before, so it is not
    // trustworthy enough to guess a number with. Say so instead.
    expect(formatIntentReceipt({ tokensIn: 10, tokensOut: 2, costUsd: null }, 'm')).toBe(
      'Intent: 10 in / 2 out — cost not reported (m)',
    );
  });
});
