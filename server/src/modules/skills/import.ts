import zlib from 'node:zlib';
import type { SkillSource, SkillType } from '@devdigest/shared';

/**
 * Skill import — EXTRACT ONLY, NEVER EXECUTE.
 *
 * The product pulls a skill's *core* (its markdown body) out of an uploaded file
 * and returns a preview. It is a deliberate trust boundary: an imported skill is
 * someone else's instructions that would land in an agent's prompt. So:
 *   - Only markdown (`.md`) is ever read. `.sh`/`.js`/binaries inside an archive
 *     are ignored — never decompressed, never run, never shelled out to.
 *   - Nothing is persisted here. The route returns a preview; the client saves it
 *     (disabled-until-vetted) via the normal POST /skills only after confirmation.
 *
 * Pure + dependency-free (Node's built-in zlib does DEFLATE), so it is trivially
 * unit-tested and can't reach the network or filesystem.
 */

export interface SkillPreview {
  name: string;
  body: string;
  type: SkillType;
  source: SkillSource;
  evidence_files: string[] | null;
}

/** Hard caps so a hostile archive can't exhaust memory (zip-bomb defense). */
const MAX_ENTRIES = 2048;
const MAX_MARKDOWN_BYTES = 1_000_000; // per markdown entry we choose to decompress
const MAX_MARKDOWN_ENTRIES = 64; // how many .md entries we'll decompress at all

export class SkillImportError extends Error {}

/** The first `# heading` text in a markdown body, if any. */
export function firstHeading(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

function baseName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

function isMarkdown(path: string): boolean {
  return /\.mdx?$/i.test(baseName(path));
}

/** Derive a skill name: explicit → first heading → filename stem → 'imported-skill'. */
function deriveName(explicit: string | undefined, filename: string | undefined, body: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const heading = firstHeading(body);
  if (heading) return heading;
  if (filename) return baseName(filename).replace(/\.[^.]+$/, '') || 'imported-skill';
  return 'imported-skill';
}

/**
 * Build a preview from raw markdown text (a `.md` upload, or a URL fetched
 * server-side). `source` distinguishes those callers.
 */
export function previewFromMarkdown(opts: {
  content: string;
  filename?: string;
  name?: string;
  source: SkillSource;
}): SkillPreview {
  const body = opts.content.replace(/^﻿/, ''); // strip BOM
  if (body.trim().length === 0) throw new SkillImportError('The file is empty.');
  return {
    name: deriveName(opts.name, opts.filename, body),
    body,
    type: 'custom',
    source: opts.source,
    evidence_files: null,
  };
}

// ---- ZIP (central-directory) reader — metadata only, no decompression -------

interface ZipEntry {
  name: string;
  method: number; // 0 = stored, 8 = deflate
  compSize: number;
  uncompSize: number;
  localOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CDIR_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/**
 * List every entry's metadata by walking the ZIP central directory. This reads
 * headers only — it does NOT decompress any file data, so listing a hostile
 * archive is cheap and safe.
 */
export function listZipEntries(buf: Buffer): ZipEntry[] {
  // Find the End Of Central Directory record by scanning backwards for its
  // signature (it sits after all data, before an optional trailing comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new SkillImportError('Not a valid .zip archive.');

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (total > MAX_ENTRIES) throw new SkillImportError('Archive has too many entries.');

  const entries: ZipEntry[] = [];
  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDIR_SIG) {
      throw new SkillImportError('Corrupt .zip central directory.');
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.push({ name, method, compSize, uncompSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Decompress ONE entry's bytes to a UTF-8 string (only ever called for `.md`). */
function readEntryText(buf: Buffer, entry: ZipEntry): string {
  if (entry.uncompSize > MAX_MARKDOWN_BYTES) {
    throw new SkillImportError(`"${entry.name}" is too large to import.`);
  }
  const lo = entry.localOffset;
  if (buf.readUInt32LE(lo) !== LOCAL_SIG) throw new SkillImportError('Corrupt .zip entry.');
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return data.toString('utf8'); // stored
  if (entry.method === 8) return zlib.inflateRawSync(data).toString('utf8'); // deflate
  throw new SkillImportError(`Unsupported compression in "${entry.name}".`);
}

/** Pick the skill "core": a top-level SKILL.md wins, else the shallowest `.md`. */
function pickCore(mdEntries: ZipEntry[]): ZipEntry {
  const byPreference = [...mdEntries].sort((a, b) => {
    const aSkill = baseName(a.name).toLowerCase() === 'skill.md' ? 0 : 1;
    const bSkill = baseName(b.name).toLowerCase() === 'skill.md' ? 0 : 1;
    if (aSkill !== bSkill) return aSkill - bSkill;
    const depth = a.name.split('/').length - b.name.split('/').length;
    if (depth !== 0) return depth;
    return a.name.localeCompare(b.name);
  });
  return byPreference[0]!;
}

/**
 * Extract a skill preview from a `.zip`. Only markdown entries are decompressed;
 * everything else (scripts, binaries) is listed-but-ignored — its bytes are never
 * touched. The core markdown becomes the body; any other `.md` files are recorded
 * as `evidence_files` (names only, for provenance).
 */
export function previewFromArchive(buf: Buffer, name?: string): SkillPreview {
  const entries = listZipEntries(buf).filter(
    (e) => !e.name.endsWith('/') && !e.name.startsWith('__MACOSX/'),
  );
  const mdEntries = entries.filter((e) => isMarkdown(e.name));
  if (mdEntries.length === 0) {
    throw new SkillImportError('The archive contains no markdown (.md) skill file.');
  }
  if (mdEntries.length > MAX_MARKDOWN_ENTRIES) {
    throw new SkillImportError('The archive has too many markdown files.');
  }

  const core = pickCore(mdEntries);
  const body = readEntryText(buf, core).replace(/^﻿/, '');
  if (body.trim().length === 0) throw new SkillImportError('The skill markdown is empty.');

  const evidence = mdEntries.filter((e) => e.name !== core.name).map((e) => e.name);

  return {
    name: deriveName(name, core.name, body),
    body,
    type: 'custom',
    source: 'extracted',
    evidence_files: evidence.length > 0 ? evidence : null,
  };
}
