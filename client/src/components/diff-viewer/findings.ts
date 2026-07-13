/* Review-finding support for the DiffViewer (Files changed tab).
   Pure helpers + the structural shape the viewer needs. A finding anchors on
   `start_line`, which is a NEW-FILE (RIGHT-side) line number — a finding on a
   deleted line therefore has no anchor here and is simply not badged (it is
   still reachable on the Findings tab).

   The shape is STRUCTURAL, not an import of `FindingRecord`: the diff-viewer is
   the shared ring and stays decoupled from the review contracts, and any object
   with these fields (a `FindingRecord` is one) can be passed in. */
import type { Line } from "./helpers";
import { lineKey } from "./comments";

/** The bits of a review finding the diff gutter needs to badge a line. */
export interface DiffFinding {
  id: string;
  severity: string;
  title: string;
  file: string;
  start_line: number;
}

/**
 * Index one file's findings by the RIGHT-side line they anchor to
 * (`"RIGHT:<start_line>"` — the same key shape the comment threads use).
 */
export function indexFindings(findings: DiffFinding[], path: string): Map<string, DiffFinding[]> {
  const byLine = new Map<string, DiffFinding[]>();
  for (const f of findings) {
    if (f.file !== path) continue;
    const key = lineKey("RIGHT", f.start_line);
    if (!key) continue;
    const list = byLine.get(key) ?? [];
    list.push(f);
    byLine.set(key, list);
  }
  return byLine;
}

/** Findings anchored to a given parsed line (RIGHT side only — see the note above). */
export function findingsForLine(ln: Line, byLine: Map<string, DiffFinding[]>): DiffFinding[] {
  if (byLine.size === 0) return [];
  if (ln.kind !== "add" && ln.kind !== "ctx") return [];
  const key = lineKey("RIGHT", ln.newNo);
  if (!key) return [];
  return byLine.get(key) ?? [];
}
