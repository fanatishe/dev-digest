import { z } from 'zod';

/**
 * `modules/pulls` — module-level constants (domain ring: pure values + Zod, no
 * I/O, no container, no Drizzle, no Fastify).
 *
 * Distinct from `classifier.constants.ts`, which is the constants home of the
 * SMART-DIFF CLASSIFIER (its path patterns and its size/summary thresholds).
 * The values below are not classification: they govern what the PR-LIST read is
 * allowed to spend. Mixing an HTTP-ring spend policy into the pure classifier's
 * pattern table would blur a boundary the classifier's own docblock draws.
 */

/**
 * Cap on background intent jobs enqueued per `GET /repos/:id/pulls` request.
 *
 * This is a MONEY threshold — every enqueued job is one billable model call made
 * with no human in the loop — so it is declared here, in the module's constants
 * home, and not inline in a handler body where nobody would find it. Mirrors
 * `BACKFILL_LIMIT` (the other per-request cap in that handler).
 */
export const INTENT_ENQUEUE_LIMIT = 10;

/**
 * The payload the PR-list read mints for an intent job. Declared here because
 * `modules/pulls` is the PRODUCER; the consumer (`modules/reviews`) parses the
 * same shape on its own side of the `jobs` table, which is the correct posture
 * for data that round-trips through free-form `jsonb`.
 *
 * Used to READ payloads back out of the in-flight queue for the enqueue dedupe:
 * `jobs.payload` is `unknown`, so it is parsed, never cast.
 */
export const IntentJobPayload = z.object({ prId: z.string().uuid() });
export type IntentJobPayload = z.infer<typeof IntentJobPayload>;
