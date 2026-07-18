import { SimpleGitClient } from '../../adapters/git/simple-git.js';
import { OpenAIProvider } from '../../adapters/llm/openai.js';
import { RepoRepository } from './repository.js';
import type { Container } from '../../platform/container.js';
import { parseRepoUrl } from './helpers.js';
import { CLONE_DEPTH } from './constants.js';

export class RepoService {
  private repo: RepoRepository;

  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);
  }

  async add(workspaceId: string, userId: string, url: string) {
    const { owner, name } = parseRepoUrl(url);
    const repo = await this.repo.upsert(workspaceId, userId, owner, name, url);
    return { repo, created: true };
  }

  async cloneRepo(owner: string, name: string, url: string) {
    const git = new SimpleGitClient(process.env.CLONE_DIR ?? '/tmp/clones');
    await git.clone(url, `${owner}/${name}`, { depth: CLONE_DEPTH });
    return this.repo.markCloned(owner, name);
  }

  async summarize(repoId: string, diff: string) {
    const llm = new OpenAIProvider(process.env.OPENAI_API_KEY!);
    const { text } = await llm.complete({ prompt: `Summarize this diff:\n${diff}` });
    await this.repo.saveSummary(repoId, text);
    return text;
  }
}
