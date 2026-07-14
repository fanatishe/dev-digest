/**
 * INFRASTRUCTURE ring — the only module that reads the environment.
 *
 * Env is parsed once, at the composition root, and the resulting object is passed
 * down. Nothing else in the package touches `process.env` (the domain ring is
 * mechanically forbidden from it — see .dependency-cruiser.cjs).
 *
 * There are no secrets here: the API needs no auth headers.
 */
import { z } from 'zod';

import type { McpConfig } from './ports.js';

const EnvSchema = z.object({
  /** Where the DevDigest API listens. `./scripts/dev.sh` puts it on :3001. */
  DEVDIGEST_API_URL: z.string().url().default('http://localhost:3001'),
  /** Interval between `GET /pulls/:id/runs` polls while a review is running. */
  DEVDIGEST_MCP_POLL_MS: z.coerce.number().int().min(200).max(60_000).default(2_000),
  /** Give up waiting after this long — the run is NOT cancelled (§6, the money rule). */
  DEVDIGEST_MCP_RUN_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(1_800_000).default(180_000),
  /** Request timeout for a single HTTP call. */
  DEVDIGEST_MCP_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
});

export const FIRST_POLL_DELAY_MS = 1_500;
export const CACHE_TTL_MS = 60_000;

/**
 * Parses the environment. `safeParse` + a readable throw: a config typo must fail at
 * boot with an explanation on STDERR, not mid-tool-call with a zod stack trace.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(env)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid DevDigest MCP configuration — ${issues}`);
  }
  return {
    apiUrl: parsed.data.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    pollIntervalMs: parsed.data.DEVDIGEST_MCP_POLL_MS,
    firstPollDelayMs: FIRST_POLL_DELAY_MS,
    runTimeoutMs: parsed.data.DEVDIGEST_MCP_RUN_TIMEOUT_MS,
    httpTimeoutMs: parsed.data.DEVDIGEST_MCP_HTTP_TIMEOUT_MS,
    cacheTtlMs: CACHE_TTL_MS,
  };
}
