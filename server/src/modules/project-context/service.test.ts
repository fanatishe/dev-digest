import { describe, it, expect, vi } from 'vitest';
import { NotFoundError } from '../../platform/errors.js';
import { ProjectContextService, tallyUsedBy } from './service.js';
import type { Container } from '../../platform/container.js';

/**
 * Unit test (no DB): the pure `used_by` tally. Given the workspace's persisted
 * `context_docs` path-lists, it counts how many OWNERS attach each path (SPEC-01
 * AC-4) — a doc attached to two agents tallies 2; a doc listed twice by one owner
 * still tallies 1 for that owner.
 */
describe('tallyUsedBy', () => {
  it('counts one per owner-list that references a path', () => {
    const counts = tallyUsedBy([
      ['specs/a.md', 'docs/b.md'],
      ['specs/a.md'],
      ['docs/c.md'],
    ]);
    expect(counts.get('specs/a.md')).toBe(2); // AC-4: attached by two owners
    expect(counts.get('docs/b.md')).toBe(1);
    expect(counts.get('docs/c.md')).toBe(1);
    expect(counts.get('missing.md')).toBeUndefined();
  });

  it('dedups within a single owner-list (per-owner, not per-occurrence)', () => {
    const counts = tallyUsedBy([['specs/a.md', 'specs/a.md']]);
    expect(counts.get('specs/a.md')).toBe(1);
  });

  it('is empty for no lists', () => {
    expect(tallyUsedBy([]).size).toBe(0);
  });
});

/**
 * Unit test (no DB): the lazy content read's SECURITY SEAM (AC-6). The endpoint
 * delegates verbatim to `ProjectContextService.getContextDocContent`; here we
 * stub the repository so we can prove — runnably, without Docker/Postgres — that
 * an unsafe/non-`.md`/cross-tenant/absent request 404s and NEVER reaches the
 * filesystem read (`isSafeRepoPath` + `.md` guard run BEFORE `readDocBody`).
 */
describe('ProjectContextService.getContextDocContent', () => {
  const WS = 'ws-1';
  const REPO = 'repo-1';

  /** A service whose repository is fully stubbed (no real DB / fs). */
  function makeService(overrides: {
    clonePath?: string | null;
    body?: string | null;
  }) {
    const readDocBody = vi.fn(async () => overrides.body ?? null);
    const getClonePath = vi.fn(async () => overrides.clonePath ?? null);
    // container.db is only touched by the repository ctor; the repo is replaced.
    const svc = new ProjectContextService({ db: {} } as unknown as Container);
    (svc as unknown as { repo: unknown }).repo = { getClonePath, readDocBody };
    return { svc, readDocBody, getClonePath };
  }

  it('returns { path, body } for a safe existing `.md` under the clone', async () => {
    const { svc, readDocBody } = makeService({ clonePath: '/clones/r', body: '# Doc\nbody' });
    const out = await svc.getContextDocContent(WS, REPO, 'specs/public-api.md');
    expect(out).toEqual({ path: 'specs/public-api.md', body: '# Doc\nbody' });
    expect(readDocBody).toHaveBeenCalledWith('/clones/r', 'specs/public-api.md');
  });

  it('404s a `../../etc/passwd` traversal path and NEVER reads the filesystem', async () => {
    const { svc, readDocBody } = makeService({ clonePath: '/clones/r', body: 'ROOT:x:0:0' });
    await expect(svc.getContextDocContent(WS, REPO, '../../etc/passwd')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    // The load-bearing property: the read is never attempted for an unsafe path.
    expect(readDocBody).not.toHaveBeenCalled();
  });

  it('404s a non-`.md` path before any read (extension boundary)', async () => {
    const { svc, readDocBody } = makeService({ clonePath: '/clones/r', body: 'secret' });
    await expect(svc.getContextDocContent(WS, REPO, 'specs/config.yaml')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(readDocBody).not.toHaveBeenCalled();
  });

  it('404s a cross-tenant / uncloned repo before any read (workspace scoping)', async () => {
    const { svc, readDocBody } = makeService({ clonePath: null });
    await expect(svc.getContextDocContent(WS, REPO, 'specs/x.md')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(readDocBody).not.toHaveBeenCalled();
  });

  it('404s an absent (but safe) `.md` path — reader returns null', async () => {
    const { svc, readDocBody } = makeService({ clonePath: '/clones/r', body: null });
    await expect(svc.getContextDocContent(WS, REPO, 'specs/missing.md')).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(readDocBody).toHaveBeenCalledOnce(); // safe path → read attempted, then null → 404
  });
});
