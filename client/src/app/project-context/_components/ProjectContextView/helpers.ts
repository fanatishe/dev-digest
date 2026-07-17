import type { ContextDoc } from "@devdigest/shared";

/** Derived, non-destructive substring filter on repo-relative path (AC-5). Case-
    insensitive; an empty query returns the list unchanged. Pure — computed in
    render, never copied into state. */
export function filterDocs(docs: ContextDoc[], query: string): ContextDoc[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) => d.path.toLowerCase().includes(q));
}

/** Split a repo-relative posix path into its filename and directory portion for the
    two-line list row (bold filename + folder-path subtitle). Pure; the empty-dir
    (top-level file) case returns `dir: ""`. Values are author-controlled and always
    rendered as text nodes by the caller (never HTML). */
export function splitPath(path: string): { name: string; dir: string } {
  const slash = path.lastIndexOf("/");
  if (slash < 0) return { name: path, dir: "" };
  return { name: path.slice(slash + 1), dir: path.slice(0, slash + 1) };
}
