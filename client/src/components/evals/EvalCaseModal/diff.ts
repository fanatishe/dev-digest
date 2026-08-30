/* diff.ts — split a (possibly multi-file) unified diff into per-file chunks.

   The eval-case input is authored as ONE git-style unified diff (a plain textarea, the
   `input_diff` source of truth). The read-only Files tab is a projection of that diff:
   this splits the blob into one entry per file so the tab can show a file list + the
   selected file's raw patch. It is a lightweight parser, not a full diff model — it only
   needs to group lines by file and recover each file's path. */

export interface DiffFile {
  path: string;
  /** The raw chunk text for this file (headers + hunks), as-is. */
  patch: string;
}

/** Recover a file path from a chunk: prefer `+++ b/<path>`, then the `diff --git` header. */
function pathFromChunk(chunk: string): string {
  for (const line of chunk.split("\n")) {
    let m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) return m[1]!.trim();
    m = line.match(/^diff --git a\/\S+ b\/(.+)$/);
    if (m) return m[1]!.trim();
    m = line.match(/^\+\+\+ (?!\/dev\/null)(.+)$/);
    if (m) return m[1]!.trim();
  }
  return "";
}

/** Split a unified diff into per-file chunks. Splits on `diff --git` boundaries when the
    diff carries git headers, else on each `--- ` file header; a diff with neither marker
    is returned as a single chunk. Tolerant of empty/blank input (→ `[]`). */
export function splitDiffByFile(diff: string | null | undefined): DiffFile[] {
  const text = (diff ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) return [];

  const lines = text.split("\n");
  const hasGit = lines.some((l) => l.startsWith("diff --git"));
  const isBoundary = hasGit
    ? (l: string) => l.startsWith("diff --git")
    : (l: string) => l.startsWith("--- ");

  if (!lines.some(isBoundary)) {
    return [{ path: pathFromChunk(text) || "diff", patch: text.trim() }];
  }

  const chunks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (isBoundary(line)) {
      if (current) chunks.push(current);
      current = [];
    }
    if (current) current.push(line); // any preamble before the first boundary is dropped
  }
  if (current) chunks.push(current);

  return chunks.map((ls) => {
    const patch = ls.join("\n").trim();
    return { path: pathFromChunk(patch) || "diff", patch };
  });
}
