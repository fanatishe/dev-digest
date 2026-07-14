/**
 * Onion-architecture boundary ruleset for `@devdigest/mcp`.
 *
 * The skill's shipped ruleset encodes the SERVER's folder names
 * (routes/service/repository) — these are not mcp's. This file encodes mcp's
 * rings, inner → outer:
 *
 *   domain (pure)      src/{format,errors,schemas}.ts        no I/O at all
 *   ports              src/ports.ts · src/types.ts           ApiPort + McpConfig, types
 *   application        src/services/*.ts · src/resolve.ts · src/wait.ts
 *                                                            the PORT, never the impl
 *   infrastructure     src/api/http-client.ts · src/config.ts  the only fetch/env
 *   transport          src/index.ts · src/tools/*.ts         the MCP SDK
 *
 * Run:  cd mcp && npx depcruise --config .dependency-cruiser.cjs src
 * A conforming tree yields ZERO violations.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Transport must not skip the application ring ────────────────────────
    {
      name: 'tools-no-infra',
      comment:
        'A tool handler is thin: schema → one service call → format. Reaching src/api/** would collapse transport into infrastructure (the repo\'s known "routes query the DB" sin).',
      severity: 'error',
      from: { path: '^src/tools/' },
      to: { path: '^src/api/' },
    },

    // ── Application depends on the PORT, never on the implementation ─────────
    {
      name: 'app-depends-on-port-not-impl',
      comment:
        'services/, resolve.ts and wait.ts take an ApiPort and an McpConfig — both declared in the PORTS ring. Importing api/http-client.ts (the impl) or config.ts (which reads process.env) would point the application ring OUTWARD at infrastructure: it inverts the dependency arrow and forces fetch/env-stubbing in tests. McpConfig lives in ports.ts precisely so this rule can be absolute.',
      severity: 'error',
      from: { path: '^src/(services/|resolve\\.ts$|wait\\.ts$)' },
      to: { path: '^src/(api/|config\\.ts$)' },
    },
    {
      name: 'app-no-mcp-sdk',
      comment:
        'The application ring must be testable without the MCP SDK in the loop. The SDK belongs to index.ts and tools/.',
      severity: 'error',
      from: { path: '^src/(services/|resolve\\.ts$|wait\\.ts$)' },
      to: { path: 'node_modules/@modelcontextprotocol(/|$)' },
    },

    // ── Domain purity: format/errors/schemas do NO I/O ───────────────────────
    {
      name: 'domain-must-stay-pure',
      comment:
        'format.ts / errors.ts / schemas.ts are the pure domain ring: no fetch client, no env, no fs, no MCP SDK. Take inputs as arguments, return data.',
      severity: 'error',
      from: { path: '^src/(format|errors|schemas)\\.ts$' },
      to: {
        path: '^src/(api/|config\\.ts$|services/|index\\.ts$|tools/)|node_modules/@modelcontextprotocol(/|$)|^(node:)?(fs|http|https|child_process)(/|$)',
      },
    },

    // ── Ports ring stays an interface ────────────────────────────────────────
    {
      name: 'ports-no-impl',
      comment: 'ports.ts declares interfaces; it must not import an implementation.',
      severity: 'error',
      from: { path: '^src/(ports|types)\\.ts$' },
      to: { path: '^src/(api/|services/|tools/|index\\.ts$|config\\.ts$)' },
    },

    // ── Infrastructure must not depend on the transport ring ─────────────────
    {
      name: 'infra-no-transport',
      comment:
        'The HTTP adapter depending on a tool or on index.ts would invert the arrow (outer → inner only).',
      severity: 'error',
      from: { path: '^src/(api/|config\\.ts$)' },
      to: { path: '^src/(tools/|index\\.ts$|services/)|node_modules/@modelcontextprotocol(/|$)' },
    },

    // ── The package is a client of the HTTP API, not of the server package ───
    {
      name: 'no-server-internals',
      comment:
        'mcp reaches DevDigest ONLY over HTTP. No Drizzle, no postgres, no server modules/db/adapters. @devdigest/shared is TYPES ONLY (src/types.ts).',
      severity: 'error',
      from: { path: '^src/' },
      to: {
        path: 'node_modules/(drizzle-orm|postgres)(/|$)|(^|/)server/src/(modules|db|adapters|platform)/',
      },
    },

    // ── Hygiene ─────────────────────────────────────────────────────────────
    {
      name: 'no-circular',
      comment: 'Circular imports break the inward-only layering.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'An unreachable module in a 15-file package is dead code.',
      severity: 'warn',
      from: { orphan: true, pathNot: '\\.d\\.ts$|\\.cjs$' },
      to: {},
    },
  ],

  options: {
    // Resolve the @devdigest/shared alias and .js → .ts through mcp's tsconfig.
    tsConfig: { fileName: './tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$' },
    moduleSystems: ['es6', 'cjs'],
  },
};
