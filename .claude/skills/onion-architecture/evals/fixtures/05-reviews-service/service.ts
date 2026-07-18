import type { Container } from '../../platform/container.js';
import { ReviewRepository } from './repository.js';
import { RepoRepository } from '../repos/repository.js';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { REVIEW_JOB_KIND } from './constants.js';

export class ReviewService {
  private reviews: ReviewRepository;
  private repos: RepoRepository;

  constructor(private container: Container) {
    this.reviews = new ReviewRepository(container.db);
    this.repos = new RepoRepository(container.db);
  }

  async run(workspaceId: string, repoId: string, prNumber: number) {
    const repo = await this.repos.findById(repoId);
    if (!repo) throw new Error(`repo ${repoId} not found`);

    const diff = await this.container.git.diff(`${repo.owner}/${repo.name}`, prNumber);
    const llm = await this.container.llm('openai');

    const review = await reviewPullRequest({
      diff,
      llm,
      repoFullName: `${repo.owner}/${repo.name}`,
      prNumber,
    });

    return this.reviews.save(workspaceId, repoId, prNumber, review);
  }

  async enqueue(workspaceId: string, repoId: string, prNumber: number) {
    return this.container.jobs.add(REVIEW_JOB_KIND, { workspaceId, repoId, prNumber });
  }
}
