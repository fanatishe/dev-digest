import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkContextDocs } from './walk.js';

/**
 * Unit test (no DB): the discovery walk surfaces exactly `.md` under the
 * configured roots at any depth, skips other extensions, files outside the
 * roots, and symlinks — reading each body (SPEC-01 AC-1).
 */
describe('walkContextDocs', () => {
  let clone: string;

  beforeAll(async () => {
    clone = await mkdtemp(join(tmpdir(), 'ctxdocs-'));
    await mkdir(join(clone, 'specs', 'sub'), { recursive: true });
    await mkdir(join(clone, 'docs'), { recursive: true });
    await mkdir(join(clone, 'insights'), { recursive: true });
    await mkdir(join(clone, 'notes'), { recursive: true }); // NOT a configured root

    await writeFile(join(clone, 'specs', 'public-api.md'), '# Public API\nbody');
    await writeFile(join(clone, 'specs', 'sub', 'deep.md'), '# Deep\nnested');
    await writeFile(join(clone, 'specs', 'readme.txt'), 'not markdown'); // wrong ext
    await writeFile(join(clone, 'docs', 'guide.md'), '# Guide');
    await writeFile(join(clone, 'insights', 'notes.md'), '# Insights');
    await writeFile(join(clone, 'notes', 'other.md'), '# Other'); // outside roots
    // A symlink under a root must NOT be followed.
    await symlink(join(clone, 'notes', 'other.md'), join(clone, 'docs', 'link.md'));
  });

  afterAll(async () => {
    await rm(clone, { recursive: true, force: true });
  });

  it('returns every `.md` under the configured roots at any depth, and nothing else', async () => {
    const docs = await walkContextDocs(clone, ['specs', 'docs', 'insights']);
    const paths = docs.map((d) => d.path).sort();

    expect(paths).toEqual([
      'docs/guide.md',
      'insights/notes.md',
      'specs/public-api.md',
      'specs/sub/deep.md',
    ]);
    // Excluded: outside a configured root, wrong extension, followed symlink.
    expect(paths).not.toContain('notes/other.md');
    expect(paths).not.toContain('specs/readme.txt');
    expect(paths).not.toContain('docs/link.md');
  });

  it('labels each doc with its configured root and reads the body', async () => {
    const docs = await walkContextDocs(clone, ['specs', 'docs', 'insights']);
    const deep = docs.find((d) => d.path === 'specs/sub/deep.md');
    expect(deep).toBeDefined();
    expect(deep!.root).toBe('specs');
    expect(deep!.body).toBe('# Deep\nnested');
    expect(docs.find((d) => d.path === 'docs/guide.md')!.root).toBe('docs');
  });

  it('yields an empty list when a configured root does not exist on the clone', async () => {
    const missing = await mkdtemp(join(tmpdir(), 'ctxdocs-empty-'));
    try {
      expect(await walkContextDocs(missing, ['specs', 'docs', 'insights'])).toEqual([]);
    } finally {
      await rm(missing, { recursive: true, force: true });
    }
  });

  it('discovers a configured root NAMED at any depth, labelled by the matched segment (AC-1)', async () => {
    // AC-1's exact observable: roots may be nested under arbitrary directories.
    const c = await mkdtemp(join(tmpdir(), 'ctxdocs-nested-'));
    try {
      await mkdir(join(c, 'a', 'specs'), { recursive: true });
      await mkdir(join(c, 'b', 'c', 'docs'), { recursive: true });
      await mkdir(join(c, 'insights'), { recursive: true });
      await mkdir(join(c, 'notes'), { recursive: true }); // under no configured root
      await writeFile(join(c, 'a', 'specs', 'x.md'), '# x');
      await writeFile(join(c, 'b', 'c', 'docs', 'y.md'), '# y');
      await writeFile(join(c, 'insights', 'z.md'), '# z');
      await writeFile(join(c, 'notes', 'other.md'), '# other');

      const docs = await walkContextDocs(c, ['specs', 'docs', 'insights']);

      // Exactly the three under a configured root, each labelled by its matched segment.
      expect(docs.map((d) => ({ path: d.path, root: d.root }))).toEqual([
        { path: 'a/specs/x.md', root: 'specs' },
        { path: 'b/c/docs/y.md', root: 'docs' },
        { path: 'insights/z.md', root: 'insights' },
      ]);
      expect(docs.map((d) => d.path)).not.toContain('notes/other.md');
    } finally {
      await rm(c, { recursive: true, force: true });
    }
  });

  it('never descends dependency/build dirs — a configured-root basename inside them is not context (A1)', async () => {
    const c = await mkdtemp(join(tmpdir(), 'ctxdocs-excluded-'));
    try {
      // A committed dependency tree with a `docs/` inside — must NOT be surfaced.
      await mkdir(join(c, 'node_modules', 'x', 'docs'), { recursive: true });
      await writeFile(join(c, 'node_modules', 'x', 'docs', 'readme.md'), '# dep');
      // A committed vendored package with a `docs/` inside — must NOT be surfaced.
      await mkdir(join(c, 'vendor', 'pkg', 'docs'), { recursive: true });
      await writeFile(join(c, 'vendor', 'pkg', 'docs', 'api.md'), '# vendored');
      // `.git/` (with a root-named subdir) must never be descended.
      await mkdir(join(c, '.git', 'docs'), { recursive: true });
      await writeFile(join(c, '.git', 'docs', 'hook.md'), '# git');
      // A real project-context doc still surfaces.
      await mkdir(join(c, 'docs'), { recursive: true });
      await writeFile(join(c, 'docs', 'guide.md'), '# Guide');

      const paths = (await walkContextDocs(c, ['specs', 'docs', 'insights']))
        .map((d) => d.path)
        .sort();

      expect(paths).toEqual(['docs/guide.md']);
      expect(paths).not.toContain('node_modules/x/docs/readme.md');
      expect(paths).not.toContain('vendor/pkg/docs/api.md');
      expect(paths).not.toContain('.git/docs/hook.md');
    } finally {
      await rm(c, { recursive: true, force: true });
    }
  });

  it('nested configured-root: the OUTERMOST root wins and each file is emitted once', async () => {
    // A `docs/` nested inside a `specs/` must not re-label or duplicate rows.
    const c = await mkdtemp(join(tmpdir(), 'ctxdocs-stick-'));
    try {
      await mkdir(join(c, 'specs', 'docs'), { recursive: true });
      await writeFile(join(c, 'specs', 'top.md'), '# top');
      await writeFile(join(c, 'specs', 'docs', 'inner.md'), '# inner');

      const docs = await walkContextDocs(c, ['specs', 'docs', 'insights']);

      expect(docs.map((d) => ({ path: d.path, root: d.root }))).toEqual([
        { path: 'specs/docs/inner.md', root: 'specs' }, // label sticks to outer `specs`
        { path: 'specs/top.md', root: 'specs' },
      ]);
    } finally {
      await rm(c, { recursive: true, force: true });
    }
  });
});
