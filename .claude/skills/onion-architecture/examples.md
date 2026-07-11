# Examples — good vs. bad (grounded in real files)

Every ✅ below mirrors code that exists today; every ❌ is a boundary violation the
`dependency-cruiser` ruleset flags.

---

## 1. Routes delegate; they never touch the DB

Real: `server/src/modules/repos/routes.ts`.

✅ **Good** — thin HTTP ring, delegates to the service:

```ts
export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new RepoService(app.container);

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });
}
```

❌ **Bad** — HTTP ring importing Drizzle and running a query inline:

```ts
import { db } from '../../db/client.js';           // ❌ infra import in HTTP ring
import { repositories } from '../../db/schema.js';

app.get('/repos', async (req) => {
  return db.select().from(repositories);            // ❌ raw query in routes.ts
});
```

Fix: move the query into `RepoRepository` and call `service.list(workspaceId)`.

---

## 2. Services resolve adapters via the DI container — never `new` one

Real: `server/src/modules/repos/service.ts`, `server/src/platform/container.ts`.

✅ **Good** — depend on the interface, get the impl from the container:

```ts
export class RepoService {
  private repo: RepoRepository;
  constructor(private container: Container) {
    this.repo = new RepoRepository(container.db);
  }
  async cloneRepo(owner: string, name: string, url: string) {
    const git = this.container.git;                 // ✅ GitClient interface, injected
    await git.clone(url, `${owner}/${name}`, { depth: CLONE_DEPTH });
  }
}
```

❌ **Bad** — application ring constructing a concrete adapter:

```ts
import { SimpleGitClient } from '../../adapters/git/simple-git.js'; // ❌
const git = new SimpleGitClient(cloneDir);          // ❌ bypasses the container
```

Because everything flows through `Container`, tests inject mocks with
`ContainerOverrides` (`src/adapters/mocks.ts`) instead of monkey-patching.

---

## 3. Adapters are the only place external SDKs appear

✅ **Good** — the LLM SDK lives behind the `LLMProvider` port:

```ts
// adapters/llm/openai.ts
import OpenAI from 'openai';                         // ✅ SDK only in an adapter
export class OpenAIProvider implements LLMProvider { /* ... */ }
```

The container builds it lazily and hands back the **interface**:

```ts
async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> { /* ... */ }
```

❌ **Bad** — a service importing `openai` or `octokit` directly, or a repository
reaching into GitHub. Keep SDKs under `adapters/**` behind a `@devdigest/shared`
interface.

---

## 4. `reviewer-core` stays pure — inputs in, data out

Real: `reviewer-core/src/review/run.ts`.

✅ **Good** — the engine takes the `LLMProvider` as an argument; no I/O:

```ts
import type { LLMProvider, Review, UnifiedDiff } from '@devdigest/shared';

export async function reviewPullRequest(
  args: { diff: UnifiedDiff; llm: LLMProvider; /* ... */ },
): Promise<Review> {
  // assemble prompt → call args.llm → ground findings → recompute score
}
```

❌ **Bad** — the core reaching for infrastructure:

```ts
import postgres from 'postgres';                     // ❌ no DB in the core
import { Octokit } from 'octokit';                   // ❌ no GitHub in the core
import Fastify from 'fastify';                        // ❌ no transport in the core
```

Persistence and GitHub posting stay in the **caller** (server persists + streams
SSE; the CI runner posts + writes an artifact). The core only returns data.

---

## 5. Pure transforms belong in `helpers.ts` / `constants.ts`

✅ DTO mapping (`toRepoDto`), URL parsing (`parseRepoUrl`), and literals
(`CLONE_JOB_KIND`) are side-effect-free and live in `modules/*/helpers.ts` /
`constants.ts` — importable from any ring.

❌ Do not put a DB call, a `fetch`, or a container lookup in a helper. If it needs
I/O, it is not a helper — it belongs in the service (orchestration) or a
repository/adapter (I/O).
