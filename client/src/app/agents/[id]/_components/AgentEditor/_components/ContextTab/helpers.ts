import type { ContextDoc } from "@devdigest/shared";

/** Sum the token counts of the currently-attached documents (AC-10). Pure and
    derived — computed in render from the checked set, never stored in state. */
export function attachedTokens(docs: ContextDoc[], attached: string[]): number {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  return attached.reduce((sum, path) => sum + (byPath.get(path)?.tokens ?? 0), 0);
}

/** Split a repo-relative posix path into filename + directory portion for the row
    label (bold filename + muted folder-path). Pure; a top-level file returns
    `dir: ""`. Duplicated locally on purpose — the project-context page has its own
    copy that is NOT importable across routes. Values are author-controlled and are
    always rendered as text nodes by the caller (never HTML). */
export function splitPath(path: string): { name: string; dir: string } {
  const slash = path.lastIndexOf("/");
  if (slash < 0) return { name: path, dir: "" };
  return { name: path.slice(slash + 1), dir: path.slice(0, slash + 1) };
}

/** One serialization group in the "Serializes as" manifest preview (AC-16): a
    configured root and the attached docs under it, in attached order. */
export interface ManifestGroup {
  root: string;
  paths: string[];
}

/** Derive the "Serializes as" manifest from the already-attached set: `order`
    filtered to docs that still exist, grouped by each doc's configured `root`,
    preserving attached order (groups appear in first-attached order; paths within a
    group in attached order). Display-only — reads PATHS ONLY, persists nothing,
    reads no bodies. Pure and computed in render, never stored. */
export function manifestGroups(docs: ContextDoc[], order: string[]): ManifestGroup[] {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const groups: ManifestGroup[] = [];
  const index = new Map<string, ManifestGroup>();
  for (const path of order) {
    const doc = byPath.get(path);
    if (!doc) continue;
    let group = index.get(doc.root);
    if (!group) {
      group = { root: doc.root, paths: [] };
      index.set(doc.root, group);
      groups.push(group);
    }
    group.paths.push(path);
  }
  return groups;
}
