/* github-urls.ts — build github.com deep-links from data we already hold.
   PR detail has repo full_name (owner/repo), PR number, head sha, and finding
   file/line — enough to open the PR or a file blob at a line range in a new tab. */

const HOST = "https://github.com";

/** Encode a repo-relative path for a URL while keeping "/" separators. */
function encPath(file: string): string {
  return file
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

/** https://github.com/{owner}/{repo}/pull/{number} */
export function githubPrUrl(repoFullName: string, number: number): string {
  return `${HOST}/${repoFullName}/pull/${number}`;
}

/**
 * A commit page — the NAMESPACE-FREE deep link. Unlike a PR number, a sha means the
 * same thing on a fork and on its upstream (GitHub serves inherited commits on both),
 * so this is the link used when a PR number could not be corroborated as this repo's
 * own (see `PrHistoryItem.number_confirmed`).
 */
export function githubCommitUrl(repoFullName: string, sha: string): string {
  return `${HOST}/${repoFullName}/commit/${sha}`;
}

/** A convention's cited evidence, split back into the parts a blob URL needs. */
export interface EvidenceRef {
  file: string;
  start?: number;
  end?: number;
}

/**
 * Parse a convention's `evidence_path` — the server packs it as `"file:start-end"` (or
 * `"file:start"` for a single line; see the extractor's `verifyEvidence`). Splits on the
 * LAST colon so a path that itself contains one can't corrupt the parse, and falls back
 * to a bare path (no line anchor) when the suffix isn't a line spec.
 */
export function parseEvidencePath(evidencePath: string): EvidenceRef {
  const i = evidencePath.lastIndexOf(":");
  if (i <= 0) return { file: evidencePath };

  const file = evidencePath.slice(0, i);
  const m = /^(\d+)(?:-(\d+))?$/.exec(evidencePath.slice(i + 1));
  if (!m) return { file: evidencePath };

  const start = Number(m[1]);
  const end = m[2] != null ? Number(m[2]) : undefined;
  return end != null ? { file, start, end } : { file, start };
}

/**
 * https://github.com/{owner}/{repo}/blob/{sha}/{file}#L{start}[-L{end}]
 * `sha` pins the link to the PR's head so line numbers stay accurate.
 */
export function githubBlobUrl(
  repoFullName: string,
  sha: string,
  file: string,
  startLine?: number,
  endLine?: number,
): string {
  let url = `${HOST}/${repoFullName}/blob/${sha}/${encPath(file)}`;
  if (startLine != null) {
    url += `#L${startLine}`;
    if (endLine != null && endLine !== startLine) url += `-L${endLine}`;
  }
  return url;
}
