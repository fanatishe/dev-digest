/**
 * project-context discovery — filesystem walk (infra ring).
 *
 * Walks the configured roots of a repo's clone for `.md` files and reads each
 * body. Modeled on `repo-intel/pipeline/walk.ts`'s `walkClone`: never follows
 * symlinks (loops / escape), posix-normalizes relpaths, and skips unreadable
 * directories cleanly so a partially-readable clone still yields what it can.
 *
 * This file performs fs I/O and therefore belongs to the module's INFRA ring
 * (called only from `repository.ts`); routes/service never touch fs directly.
 * Paths are derived from the configured roots + on-disk names — never from user
 * input — so a walked `path` is a real file under a configured root.
 */
import { readdir, readFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { CONTEXT_DOC_EXT } from './constants.js';

/**
 * Directories the discovery walk never descends, keyed by basename at ANY depth.
 * Mirrors `repo-intel/pipeline/walk.ts`'s `EXCLUDED_DIRS` but is defined LOCALLY
 * to keep the module boundary clean (no cross-import from repo-intel). Without
 * this gate a committed `node_modules/x/docs/readme.md` or `vendor/pkg/docs/api.md`
 * would be wrongly surfaced as a project-context doc (root matches by basename at
 * any depth), and every discovery would needlessly walk `.git/`.
 */
const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
]);

/** A `.md` matched under some configured root — path + its (sticky) root label. */
interface MatchedDoc {
  rel: string;
  root: string;
}

/** One discovered markdown document (body stays server-side; only paths leave). */
export interface WalkedDoc {
  /** Repo-relative posix path, including the configured root prefix (e.g. `specs/x.md`). */
  path: string;
  /** The configured root this doc was found under (its label). */
  root: string;
  /** File contents (utf-8). Used to count tokens; never persisted or returned to clients. */
  body: string;
}

/**
 * Scan the WHOLE clone tree for directories *named* a configured root
 * (`specs`/`docs`/`insights`) at ANY depth, and return one `WalkedDoc` per
 * readable `.md` beneath such a directory, labelled by that root segment (AC-1).
 * A clone with `a/specs/x.md`, `b/c/docs/y.md`, `insights/z.md`, `notes/other.md`
 * yields the first three; `notes/other.md` (under no configured root) is excluded.
 *
 * Nested-root rule: once a subtree is claimed by a matched root the label
 * **sticks** — a `docs/` nested inside a `specs/` does NOT re-label and each file
 * is emitted exactly once (the outermost matched root wins). Order is stable:
 * final list sorted by `path` ascending. A missing/unreadable dir contributes
 * nothing (no throw). Symlinks are never followed (loops / escape).
 */
export async function walkContextDocs(
  clonePath: string,
  roots: readonly string[],
): Promise<WalkedDoc[]> {
  const rootSet = new Set(roots);
  const matched: MatchedDoc[] = [];
  // Start OUTSIDE any root (activeRoot = null): descend looking for a directory
  // whose basename is a configured root; only then start collecting `.md`.
  await scanDir(clonePath, clonePath, rootSet, null, matched);
  matched.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const out: WalkedDoc[] = [];
  for (const { rel, root } of matched) {
    let body: string;
    try {
      body = await readFile(join(clonePath, rel), 'utf-8');
    } catch {
      continue; // unreadable file — skip, keep discovering the rest
    }
    out.push({ path: rel, root, body });
  }
  return out;
}

/**
 * Depth-first scan. `activeRoot` is the configured-root label owning the current
 * subtree, or `null` when still searching for one. `.md` files count only inside
 * a matched root; directories named a configured root open one (label sticks for
 * their whole subtree, so a nested configured root does not re-label).
 */
async function scanDir(
  clonePath: string,
  dir: string,
  rootSet: ReadonlySet<string>,
  activeRoot: string | null,
  acc: MatchedDoc[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Missing root or unreadable dir (permissions, dangling symlink) — skip cleanly.
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks (loops / escape)
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Dependency/build dirs are never descended — a configured-root basename
      // (e.g. `docs`) committed under `node_modules`/`vendor` is not project context.
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      // Inside a matched root the label sticks; otherwise a root-named dir opens
      // one, and any other dir keeps searching for a (possibly nested) root.
      const nextRoot = activeRoot ?? (rootSet.has(entry.name) ? entry.name : null);
      await scanDir(clonePath, full, rootSet, nextRoot, acc);
      continue;
    }
    if (!entry.isFile()) continue;
    if (activeRoot === null) continue; // file outside every configured root — excluded
    if (extname(entry.name).toLowerCase() !== CONTEXT_DOC_EXT) continue;
    // Posix-relative to the clone root so DB/contract paths are platform-agnostic.
    const rel = relative(clonePath, full).split(sep).join('/');
    acc.push({ rel, root: activeRoot });
  }
}
