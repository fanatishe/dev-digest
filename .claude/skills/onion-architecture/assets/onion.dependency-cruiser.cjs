/**
 * Onion-architecture boundary ruleset for the DevDigest backend.
 *
 * Encodes the dependency-INWARD rule as forbidden import edges. Uses the
 * `dependency-cruiser` that `server` already depends on (^17.4.3) — no install.
 *
 * Run from a package dir (so `./tsconfig.json` and path aliases resolve):
 *   cd server        && pnpm exec depcruise --config ../.claude/skills/onion-architecture/assets/onion.dependency-cruiser.cjs src
 *   cd reviewer-core && pnpm exec depcruise --config ../.claude/skills/onion-architecture/assets/onion.dependency-cruiser.cjs src
 *
 * Path notes:
 *   - Rule `path`/`pathNot` are JS regexes matched against module paths.
 *   - Local files appear as `src/...`; npm packages as `node_modules/<pkg>/...`.
 *   - `(/|$)` after a package name is a word-boundary so `fastify` does not also
 *     match `fastify-sse-v2` / `fastify-type-provider-zod`.
 *
 * A conforming tree yields ZERO violations. See references/enforcement.md.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── HTTP ring (routes.ts) must not reach the DB or SDKs directly ──────────
    {
      name: 'routes-no-db',
      comment:
        'routes.ts is the transport ring: no Drizzle/postgres/db-client. Go through a service → repository.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/routes\\.ts$' },
      to: { path: 'node_modules/(drizzle-orm|postgres)(/|$)|src/db/(client|schema)' },
    },
    {
      name: 'routes-no-external-sdk',
      comment:
        'routes.ts must not import LLM/GitHub/git SDKs directly — delegate to a service; SDKs live in adapters/.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/routes\\.ts$' },
      to: { path: 'node_modules/(openai|@anthropic-ai|octokit|simple-git)(/|$)' },
    },

    // ── Application ring (service.ts) — no transport, no raw DB, no raw SDKs ───
    {
      name: 'service-no-fastify',
      comment: 'service.ts is the application ring: no Fastify/HTTP concerns.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/service\\.ts$' },
      to: { path: 'node_modules/(fastify|@fastify|fastify-type-provider-zod|fastify-sse-v2)(/|$)' },
    },
    {
      name: 'service-no-db-driver',
      comment:
        'service.ts must not run raw Drizzle/postgres — persistence goes through a repository.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/service\\.ts$' },
      to: { path: 'node_modules/(drizzle-orm|postgres)(/|$)' },
    },
    {
      name: 'service-no-external-sdk',
      comment:
        'service.ts must not construct external SDK clients — resolve adapters via the DI Container.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/service\\.ts$' },
      to: { path: 'node_modules/(openai|@anthropic-ai|octokit|simple-git)(/|$)' },
    },

    // ── Pure helpers/constants — no I/O, no framework ─────────────────────────
    {
      name: 'helpers-must-stay-pure',
      comment:
        'helpers.ts / constants.ts are pure (domain core ring): no Fastify, DB, or SDK imports.',
      severity: 'error',
      from: { path: 'src/modules/[^/]+/(helpers|constants)\\.ts$' },
      to: {
        path: 'node_modules/(fastify|@fastify|drizzle-orm|postgres|openai|@anthropic-ai|octokit|simple-git)(/|$)|src/db/client',
      },
    },

    // ── Infrastructure must not depend on the transport ring ──────────────────
    {
      name: 'adapters-no-transport',
      comment:
        'An adapter depending on a route would invert the dependency arrow (outer→inner only).',
      severity: 'error',
      from: { path: 'src/adapters/' },
      to: { path: 'src/modules/[^/]+/routes\\.ts$|node_modules/(fastify|@fastify)(/|$)' },
    },

    // ── reviewer-core is the PURE domain core ─────────────────────────────────
    {
      name: 'core-purity-no-io',
      comment:
        'reviewer-core is pure: no DB, GitHub, git, fs, or HTTP. Its only side effect is the injected LLMProvider.',
      severity: 'error',
      // `from` matches reviewer-core source (cruised from reviewer-core/, or
      // followed via the @devdigest/reviewer-core alias from server/). The
      // `pathNot` excludes server's own infra/transport folders so a run from
      // server/ never false-positives on db/client.ts or app.ts.
      from: {
        path: '(^|/)src/',
        pathNot: '(^|/)src/(adapters|db|platform|modules|prompts|vendor)/|(^|/)src/(app|server)\\.ts$',
      },
      to: {
        path: 'node_modules/(postgres|drizzle-orm|octokit|simple-git|fastify|@fastify)(/|$)|^(node:)?fs(/|$)',
      },
    },
    {
      name: 'core-no-server',
      comment: 'reviewer-core must never import the server package (that would point outward).',
      severity: 'error',
      from: { path: '(^|/)reviewer-core/src/' },
      to: { path: '(^|/)server/src/|node_modules/@devdigest/api(/|$)' },
    },

    // ── Hygiene ───────────────────────────────────────────────────────────────
    {
      name: 'no-circular',
      comment: 'Circular imports break the inward-only layering.',
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
  ],

  options: {
    // Resolve TS path aliases (@devdigest/*) and .js→.ts via the package tsconfig
    // in the current working directory.
    tsConfig: { fileName: './tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.(it\\.)?test\\.ts$|/test/|/__mocks__/' },
    moduleSystems: ['es6', 'cjs'],
  },
};
