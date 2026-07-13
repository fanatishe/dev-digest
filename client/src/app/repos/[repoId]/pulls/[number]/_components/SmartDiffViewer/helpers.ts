/** Pure helpers for SmartDiffViewer. */
import type { PrFile, SmartDiffFile } from "@devdigest/shared";

/** Index the PR's raw files (which carry the patch text) by path. */
export function byPath(files: PrFile[]): Map<string, PrFile> {
  return new Map(files.map((f) => [f.path, f]));
}

/**
 * Join a smart-diff entry back to the raw `PrFile` that carries its patch.
 * The smart diff is a re-ORDERING of `pr.files` — the same rows, regrouped — so
 * a miss means the two reads raced (a file landed between them); we still render
 * the header with the counts we do have rather than dropping the file silently.
 */
export function toPrFile(sdf: SmartDiffFile, patches: Map<string, PrFile>): PrFile {
  const raw = patches.get(sdf.path);
  return {
    path: sdf.path,
    additions: sdf.additions,
    deletions: sdf.deletions,
    patch: raw?.patch ?? null,
  };
}
