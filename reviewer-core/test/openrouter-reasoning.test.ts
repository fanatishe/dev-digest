/**
 * OpenRouterProvider — the `reasoning` passthrough.
 *
 * Why this test exists, and why it asserts what it does:
 *
 * The Intent Layer defaults to `deepseek/deepseek-v4-flash`, a REASONING-CAPABLE
 * flash model. Left to itself it will "think" through what is a mechanical JSON
 * extraction and bill those think-tokens as OUTPUT — quietly undoing the cost
 * saving that made a flash model the right pick in the first place. The intent
 * service therefore sends `reasoning: { enabled: false }`, and this pins that the
 * flag actually survives the three hops and reaches the request BODY.
 *
 * The obvious test — "assert tokensOut is small" — would be VACUOUS: the mock
 * provider hardcodes its token counts, so it would pass whether or not the flag
 * was ever sent. The only honest assertion is on the wire format.
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

const Schema = z.object({ intent: z.string() });

/** Swap the internal OpenAI SDK client for a spy, and capture the request body. */
function providerWithSpy(id: 'openrouter' | 'openai' = 'openrouter') {
  const create = vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify({ intent: 'Add rate limiting' }) } }],
    usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.0001 },
  }));
  const provider = new OpenRouterProvider('test-key', { id });
  (provider as unknown as { client: unknown }).client = {
    chat: { completions: { create } },
  };
  return { provider, create };
}

const REQ = {
  model: 'deepseek/deepseek-v4-flash',
  schema: Schema,
  schemaName: 'IntentExtraction',
  messages: [{ role: 'user' as const, content: 'classify this PR' }],
};

describe('OpenRouterProvider — reasoning passthrough', () => {
  it('sends `reasoning: { enabled: false }` in the request body when the caller asks for it', async () => {
    const { provider, create } = providerWithSpy();

    await provider.completeStructured({ ...REQ, reasoning: { enabled: false } });

    const body = create.mock.calls[0]![0] as { reasoning?: { enabled: boolean } };
    // The guard in the adapter is on the OBJECT, not on `.enabled` — so a
    // deliberate `false` must not be swallowed by a truthiness check.
    expect(body.reasoning).toEqual({ enabled: false });
  });

  it('omits `reasoning` entirely when the caller does not set it (existing calls unchanged)', async () => {
    const { provider, create } = providerWithSpy();

    await provider.completeStructured(REQ);

    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('reasoning');
  });

  it('does not send `reasoning` to a plain OpenAI endpoint (it is an OpenRouter extension)', async () => {
    const { provider, create } = providerWithSpy('openai');

    await provider.completeStructured({ ...REQ, reasoning: { enabled: false } });

    const body = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(body).not.toHaveProperty('reasoning');
  });
});
