/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/**
 * Job kind for the background intent auto-fill.
 *
 * Registered in `reviews/routes.ts` (via `IntentService.registerIntentJobHandler`)
 * and enqueued from `pulls/routes.ts` when the PR list finds a PR with no
 * `pr_intent` row. A constants-only cross-module import is the established shape
 * here — `repos/service.ts` imports `INDEX_JOB_KIND` from `repo-intel/constants.ts`
 * exactly this way. A constant is domain-ring data: importing it couples nothing.
 *
 * `JobRunner.enqueue` THROWS when no handler is registered for a kind, so the
 * enqueue side must stay inside a try/catch.
 */
export const INTENT_JOB_KIND = 'pr-intent';
