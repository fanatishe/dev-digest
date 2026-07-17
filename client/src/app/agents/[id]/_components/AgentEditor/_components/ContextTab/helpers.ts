import type { ContextDoc } from "@devdigest/shared";

/** Sum the token counts of the currently-attached documents (AC-10). Pure and
    derived — computed in render from the checked set, never stored in state. */
export function attachedTokens(docs: ContextDoc[], attached: string[]): number {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  return attached.reduce((sum, path) => sum + (byPath.get(path)?.tokens ?? 0), 0);
}
