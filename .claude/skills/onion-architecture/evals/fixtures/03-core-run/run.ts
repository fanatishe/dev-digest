import type { LLMProvider, Review, UnifiedDiff, Finding } from '@devdigest/shared';
import postgres from 'postgres';
import { Octokit } from 'octokit';
import { assemblePrompt } from './prompt.js';
import { groundFindings, recomputeScore } from './grounding.js';

const sql = postgres(process.env.DATABASE_URL!);

export async function reviewPullRequest(args: {
  diff: UnifiedDiff;
  llm: LLMProvider;
  repoFullName: string;
  prNumber: number;
}): Promise<Review> {
  const prompt = assemblePrompt(args.diff);
  const raw = await args.llm.complete({ prompt, schema: 'findings' });

  const findings: Finding[] = groundFindings(raw, args.diff);
  const score = recomputeScore(findings);
  const review: Review = { findings, score };

  await sql`
    insert into reviews (repo, pr, score, created_at)
    values (${args.repoFullName}, ${args.prNumber}, ${score}, now())
  `;

  const [owner, repo] = args.repoFullName.split('/');
  const gh = new Octokit({ auth: process.env.GITHUB_TOKEN });
  await gh.rest.issues.createComment({
    owner,
    repo,
    issue_number: args.prNumber,
    body: `DevDigest review score: ${score} (${findings.length} findings)`,
  });

  return review;
}
