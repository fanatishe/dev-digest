import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
} from './seed-prompts.js';
import { SkillsRepository } from '../modules/skills/repository.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import type { SkillSource, SkillType } from '@devdigest/shared';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- Skills + the Test Quality Reviewer agent -------------------------------
  // A reusable skill is text + config appended to an agent's prompt at review
  // time. We seed four and attach them to a new agent so the control experiment
  // (a happy-path-only test PR: flagged WITH skills, missed without) reproduces.
  // One skill carries source='extracted' to represent the import path end-to-end.
  const skillsRepo = new SkillsRepository(db);
  const agentsRepo = new AgentsRepository(db);

  const seedSkills: Array<{
    name: string;
    description: string;
    type: SkillType;
    source: SkillSource;
    body: string;
  }> = [
    {
      name: 'branch-coverage-nudge',
      description:
        'Flag any production branch introduced by the diff that no test in the diff exercises.',
      type: 'rubric',
      source: 'manual',
      body: `# Branch coverage
For every \`if\`/\`else\`, \`try\`/\`catch\`, guard clause, switch case, early return and
\`??\`/\`||\` fallback added or changed in this diff, confirm a test drives an input that
reaches it AND asserts a result that would fail if the branch broke. Name the exact
uncovered branch and the input that reaches it. The happy path being green is not
coverage of the error path.`,
    },
    {
      name: 'no-over-mocking',
      description:
        'Reject tests that mock the unit under test or only assert that a mock was called.',
      type: 'convention',
      source: 'manual',
      body: `# No over-mocking
A test must assert on the observable result of the real unit, not on the fact that a
test double was invoked. Flag: mocking the very function under test; mocking so much
that the assertion only proves the mock works; asserting \`spy.calledWith(...)\` where
asserting the returned value/state would actually pin the behaviour.`,
    },
    {
      name: 'flake-smells',
      description: 'Detect non-deterministic test patterns that cause flakes.',
      type: 'custom',
      source: 'manual',
      body: `# Flake smells
Flag tests that depend on real time / \`Date.now()\` / timers without fake timers,
\`sleep\`-based waits, ordering of unordered data, unseeded randomness, real
network/filesystem/shared-DB access without isolation, or state leaked between tests
(shared mutable module state, missing cleanup).`,
    },
    {
      // Represents a skill brought in via the import path (extract-only, from an
      // uploaded markdown/zip). Enabled here so the seeded experiment runs.
      name: 'corner-case-checklist',
      description: 'Enumerate the corner cases a change to input-handling code must test.',
      type: 'rubric',
      source: 'extracted',
      body: `# Corner cases
For input-handling code, require tests for: empty / null / undefined / zero inputs;
empty collections; the first and last element; boundary and off-by-one edges;
duplicate and out-of-order inputs; and the error/rejection path with the exact error
shape callers depend on. Missing any reachable case for changed behaviour is a gap.`,
    },
  ];

  const skillIds: string[] = [];
  for (const s of seedSkills) {
    const existing = (await skillsRepo.list(workspaceId)).find((x) => x.name === s.name);
    const id = existing?.id ?? (await skillsRepo.insert({ workspaceId, ...s, enabled: true })).id;
    skillIds.push(id);
  }

  const testQualityAgent: typeof t.agents.$inferInsert = {
    workspaceId,
    name: 'Test Quality Reviewer',
    description: 'Checks test quality: uncovered branches, missed corner cases, over-mocking, flakes.',
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
    enabled: true,
    version: 1,
    createdBy: userId,
  };
  let [tqAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, testQualityAgent.name)));
  if (!tqAgent) {
    [tqAgent] = await db.insert(t.agents).values(testQualityAgent).returning();
  }
  // Attach the skills in order (idempotent upsert of each link).
  for (let i = 0; i < skillIds.length; i++) {
    await agentsRepo.linkSkill(tqAgent!.id, skillIds[i]!, i);
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
