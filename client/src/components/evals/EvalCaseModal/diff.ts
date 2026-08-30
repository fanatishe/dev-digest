/* diff.ts — a tiny unified-diff builder/splitter for the eval-case authoring UI.

   The modal lets an author describe an input by its Before/After file content
   (rather than pasting a raw patch). `buildUnifiedDiff` turns that into a whole-file
   replacement patch — a single hunk with every Before line as `-` and every After
   line as `+`. It is intentionally NOT a minimal Myers diff: the case only needs a
   valid patch the review engine can parse (server `parseUnifiedDiff`) and the client
   `parsePatch` can render. `splitUnifiedDiff` is the inverse, used to prefill the
   Before/After editors when EDITING a case that already has a stored `input_diff`. */

export interface DiffParts {
  file: string;
  before: string;
  after: string;
  /** A newly-added file: no Before side, `--- /dev/null`. */
  newFile: boolean;
}

/** Split text into lines, dropping a single trailing newline (so "a\n" → ["a"]). */
function toLines(s: string): string[] {
  if (s === "") return [];
  return s.replace(/\n$/, "").split("\n");
}

/** Build a whole-file-replacement unified diff from Before/After content. */
export function buildUnifiedDiff({ file, before, after, newFile }: DiffParts): string {
  const f = file.trim() || "snippet.ts";
  const beforeLines = newFile ? [] : toLines(before);
  const afterLines = toLines(after);
  const oldRange = newFile ? "0,0" : `1,${beforeLines.length}`;
  const header = [
    `diff --git a/${f} b/${f}`,
    newFile ? "--- /dev/null" : `--- a/${f}`,
    `+++ b/${f}`,
    `@@ -${oldRange} +1,${afterLines.length} @@`,
  ];
  const body = [...beforeLines.map((l) => `-${l}`), ...afterLines.map((l) => `+${l}`)];
  return [...header, ...body].join("\n");
}

/** Reconstruct { file, before, after, newFile } from a unified-diff patch. Header
    lines (`diff --git`, `---`, `+++`, `@@`) are skipped so they never leak into the
    Before/After content. Tolerant of a missing/blank patch (→ empty parts). */
export function splitUnifiedDiff(patch: string | null | undefined): DiffParts {
  const before: string[] = [];
  const after: string[] = [];
  let file = "snippet.ts";
  let newFile = false;

  for (const raw of (patch ?? "").split("\n")) {
    if (raw.startsWith("diff --git")) {
      const m = raw.match(/ b\/(\S+)/);
      if (m) file = m[1]!;
    } else if (raw.startsWith("--- ")) {
      if (raw.includes("/dev/null")) newFile = true;
    } else if (raw.startsWith("+++ ")) {
      const m = raw.match(/\+\+\+ b\/(\S+)/);
      if (m) file = m[1]!;
    } else if (raw.startsWith("@@")) {
      // hunk header — skip
    } else if (raw.startsWith("+")) {
      after.push(raw.slice(1));
    } else if (raw.startsWith("-")) {
      before.push(raw.slice(1));
    } else if (raw !== "") {
      const t = raw.startsWith(" ") ? raw.slice(1) : raw;
      before.push(t);
      after.push(t);
    }
  }
  return { file, before: before.join("\n"), after: after.join("\n"), newFile };
}
