import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectContextRepository } from './repository.js';

/**
 * Unit test (no DB): `readDocBody`'s on-disk symlink confinement (A2 security
 * fix). `readDocBody` only touches the filesystem — never the db — so we build
 * the repository with a stub db and exercise the fs path directly. `isSafeRepoPath`
 * (in the service) blocks path-STRING traversal; this proves the reader itself
 * refuses a committed symlink that escapes the clone root on disk, mapping it to
 * the same `null` → 404 path an absent file uses, and reading nothing outside.
 */
describe('ProjectContextRepository.readDocBody', () => {
  const repo = new ProjectContextRepository({} as never);
  let clone: string;
  let outside: string;

  beforeAll(async () => {
    clone = await mkdtemp(join(tmpdir(), 'ctxrepo-'));
    outside = await mkdtemp(join(tmpdir(), 'ctxrepo-out-'));
    await mkdir(join(clone, 'docs'), { recursive: true });
    await writeFile(join(clone, 'docs', 'guide.md'), '# Guide\nbody');
    await writeFile(join(outside, 'secret.txt'), 'TOP SECRET');
    // A committed symlink INSIDE the clone that escapes to a host file outside it.
    await symlink(join(outside, 'secret.txt'), join(clone, 'docs', 'escape.md'));
  });

  afterAll(async () => {
    await rm(clone, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('reads a normal in-clone `.md` body', async () => {
    expect(await repo.readDocBody(clone, 'docs/guide.md')).toBe('# Guide\nbody');
  });

  it('returns null for a symlink resolving outside the clone root (reads nothing)', async () => {
    expect(await repo.readDocBody(clone, 'docs/escape.md')).toBeNull();
  });

  it('returns null for an absent path (realpath throws → clean 404)', async () => {
    expect(await repo.readDocBody(clone, 'docs/missing.md')).toBeNull();
  });
});
