import { z } from 'zod';

/**
 * Project-context discovery read model. The listing endpoint walks the active repo's
 * clone for `.md` under the configured roots and returns one `ContextDoc` per file —
 * PATHS ONLY (no document bodies cross this contract). `token_budget` is echoed from
 * config so the editor can flag an over-budget attachment set (AC-11).
 */

export const ContextDoc = z.object({
  path: z.string(), // repo-relative
  root: z.string(), // configured root label (specs|docs|insights by default)
  tokens: z.number().int(),
  used_by_agents: z.number().int(),
  used_by_skills: z.number().int().nullish(),
});
export type ContextDoc = z.infer<typeof ContextDoc>;

export const ContextDocList = z.object({
  docs: z.array(ContextDoc),
  token_budget: z.number().int(), // config budget, so the editor can flag over-budget (AC-11)
});
export type ContextDocList = z.infer<typeof ContextDocList>;

/**
 * One document's full content, returned by the LAZY content endpoint
 * (GET /repos/:repoId/context-docs/content?path=…). Separate from the paths-only
 * discovery contract on purpose: bodies are fetched on demand for preview, never as
 * part of the listing. `body` is UNTRUSTED author-controlled markdown — the client
 * renders it through the safe `Markdown` primitive (Preview) or read-only raw source
 * (Edit), never via dangerouslySetInnerHTML.
 */
export const ContextDocContent = z.object({
  path: z.string(), // echoes the requested repo-relative path
  body: z.string(),
});
export type ContextDocContent = z.infer<typeof ContextDocContent>;
