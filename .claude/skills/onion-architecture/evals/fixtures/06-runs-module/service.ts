import type { Container } from '../../platform/container.js';
import { RunRepository } from './repository.js';
import { enrichRunView } from './presenter.js';
import { RUN_JOB_KIND } from './constants.js';

export class RunService {
  private repo: RunRepository;

  constructor(private container: Container) {
    this.repo = new RunRepository(container.db);
  }

  async list(workspaceId: string) {
    const rows = await this.repo.listByWorkspace(workspaceId);
    return rows.map((r) => ({ id: r.id, status: r.status, prNumber: r.prNumber }));
  }

  async getRunView(id: string) {
    const run = await this.repo.findById(id);
    if (!run) throw new Error(`run ${id} not found`);
    return enrichRunView(run, this.container.db);
  }

  async enqueue(input: { workspaceId: string; repoId: string; prNumber: number }) {
    const run = await this.repo.create(input);
    await this.container.jobs.add(RUN_JOB_KIND, { runId: run.id });
    return run;
  }
}
