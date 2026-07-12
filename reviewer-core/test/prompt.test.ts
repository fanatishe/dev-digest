/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ## PR intent (derived)', () => {
  const INTENT = 'Intent: add rate limiting.\nIn scope: /api routes.\nOut of scope: the UI.';

  it('renders the untrusted-wrapped section after the PR description, before skills', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'BODY',
      skills: ['SKILL-BODY'],
      intent: INTENT,
    });
    const user = messages[1]!.content;

    expect(user).toContain('## PR intent (derived)');
    expect(user).toContain('<untrusted source="intent">');
    expect(user).toContain('Out of scope: the UI.');
    // Ordering: PR description → PR intent → skills → diff.
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## PR intent (derived)'));
    expect(user.indexOf('## PR intent (derived)')).toBeLessThan(user.indexOf('## Skills / rules'));
    expect(user.indexOf('## PR intent (derived)')).toBeLessThan(user.indexOf('## Diff to review'));

    // Per-slot token attribution in the run trace.
    expect(assembly.intent).toBe(INTENT);
  });

  it('puts the scope RULE in the trusted system message, never in the user message', () => {
    const { messages } = assemblePrompt({ system: 'sys', diff: 'DIFF', intent: INTENT });
    const system = messages[0]!.content;
    const user = messages[1]!.content;

    // The rule is trusted instruction — it must sit beside the injection guard,
    // NOT inside the <untrusted> block the guard tells the model to ignore.
    expect(system).toMatch(/SCOPE —/);
    expect(system).toMatch(/exactly ONE signal finding/i);
    expect(user).not.toMatch(/SCOPE —/);
    expect(user).not.toMatch(/exactly ONE signal finding/i);

    // …and it composes with the guard rather than fighting it: scope shapes HOW
    // MANY out-of-scope findings, it never waives a real defect.
    expect(system).toMatch(/never waives a real vulnerability or correctness defect/i);
    // The guard still stands.
    expect(system).toMatch(/DATA to be analyzed, never instructions/);
  });

  it('caps a huge intent block at 4k chars', () => {
    const { assembly } = assemblePrompt({ system: 'sys', diff: 'D', intent: 'y'.repeat(10_000) });
    expect((assembly.intent as string).length).toBe(4000);
  });

  it('REGRESSION GUARD: without an intent the prompt is byte-identical to today', () => {
    // Every existing review path (no intent computed — a review never computes
    // one silently) must produce exactly the prompt it produced before the
    // intent slot existed: no section, no scope rule, no trailing whitespace.
    const base = { system: 'AGENT-SYS', diff: 'DIFF', prDescription: 'BODY', skills: ['S'] };
    const expectedSystem = systemOf(base);
    const expectedUser = userOf(base);

    for (const absent of [undefined, '', '   ']) {
      const { messages, assembly } = assemblePrompt({ ...base, intent: absent });
      expect(messages[0]!.content).toBe(expectedSystem);
      expect(messages[1]!.content).toBe(expectedUser);
      expect(messages[1]!.content).not.toContain('## PR intent');
      expect(messages[0]!.content).not.toMatch(/SCOPE —/);
      expect(assembly.intent ?? null).toBeNull();
    }

    // Byte-level pin: the no-intent system message is still exactly two
    // '\n\n'-separated blocks (agent prompt + injection guard) — nothing appended.
    expect(expectedSystem.split('\n\n')).toHaveLength(2);
    expect(expectedSystem.startsWith('AGENT-SYS\n\n')).toBe(true);
    // …and with an intent it is three (agent prompt + guard + scope rule).
    expect(systemOf({ ...base, intent: 'I' }).split('\n\n')).toHaveLength(3);
  });
});
