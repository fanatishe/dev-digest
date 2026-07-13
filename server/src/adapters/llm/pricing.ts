/**
 * cost discipline — per-provider/model pricing table (USD per 1M tokens).
 * Unknown models return null cost (explicitly flagged), per spec.
 */
interface Price {
  in: number;
  out: number;
}

const PRICING: Record<string, Price> = {
  // OpenAI (approximate public list prices, USD / 1M tokens)
  'gpt-5.5': { in: 5.0, out: 30.0 },
  'gpt-5.4': { in: 2.5, out: 15.0 },
  'gpt-5.4-mini': { in: 0.75, out: 4.5 },
  'gpt-5.4-nano': { in: 0.2, out: 1.25 },
  'gpt-5.1': { in: 1.25, out: 10.0 },
  'gpt-5': { in: 1.25, out: 10.0 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4o': { in: 2.5, out: 10.0 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
  // Anthropic
  'claude-3-5-sonnet-latest': { in: 3.0, out: 15.0 },
  'claude-3-5-haiku-latest': { in: 0.8, out: 4.0 },
  'claude-3-opus-latest': { in: 15.0, out: 75.0 },
  // OpenRouter (CI runner, cheap models).
  // RECONCILED 2026-07-12 against the live OpenRouter catalog (`/api/v1/models`):
  //   - deepseek-v4-flash was listed at $0.14/$0.28 — it is $0.077/$0.154. It is
  //     now the default model for the `review_intent` feature, whose whole selling
  //     point is cost, so a fictional price here would falsify the receipt.
  //   - glm-4.7-flash was listed as free ({in:0,out:0}) — it is NOT free.
  //   - glm-4.7-flashx no longer exists in the catalog; the row was removed (an
  //     unknown slug falls through to null cost, which is the honest answer).
  // The rest are unverified approximations. Re-check before trusting them; an
  // unknown slug returns null cost (explicitly flagged), which is safe.
  'z-ai/glm-4.7-flash': { in: 0.06, out: 0.4 },
  'deepseek/deepseek-v4-flash': { in: 0.077, out: 0.154 },
  'minimax/minimax-m2.5': { in: 0.3, out: 1.2 },
  'z-ai/glm-5.1': { in: 0.6, out: 2.2 },
};

export function estimateCost(model: string, tokensIn: number, tokensOut: number): number | null {
  const p = PRICING[model];
  if (!p) return null;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}
