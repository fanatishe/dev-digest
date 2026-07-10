# References & sources

External material behind this skill, kept for the README and further reading.

## Onion architecture — theory

- **Jeffrey Palermo — "The Onion Architecture" (original series, 2008):**
  https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/
- **NDepend — "Onion Architecture: Going Beyond Layers":**
  https://blog.ndepend.com/onion-architecture-layers/
- **Bitloops — "Onion Architecture: Concentric Layers Without Compromise":**
  https://bitloops.com/resources/software-architecture/onion-architecture
- **TMS Outsource — "What Is Onion Architecture? Structuring Code from the Core Out":**
  https://tms-outsource.com/blog/posts/onion-architecture/

## Onion / Clean architecture in Node.js + TypeScript

- **Remo Jansen (DEV) — "Implementing SOLID and the Onion architecture in Node.js
  with TypeScript and InversifyJS":**
  https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad
- **André Bazaglia — "Clean architecture with TypeScript: DDD, Onion":**
  https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/
- **Sankhadip Samanta (Medium) — "Onion Architecture in Node.js with TypeScript":**
  https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391

## Fastify + Drizzle + layered/clean structure

- **256Taras — Fastify 5 + Drizzle + DDD-Lite / Clean-Lite starter kit:**
  https://github.com/256Taras/fastify-typescript-drizzle-starter-kit
- **revell29 — Fastify + TypeScript DDD + Clean Architecture:**
  https://github.com/revell29/fastify-clean-architecture
- **marcoturi — Fastify 5 clean-architecture / DDD / CQRS boilerplate:**
  https://github.com/marcoturi/fastify-boilerplate
- **Sentry — "Atomic Repositories in Clean Architecture and TypeScript":**
  https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/

## Boundary-enforcement tooling

- **dependency-cruiser** (chosen — already a `server` dependency):
  https://github.com/sverweij/dependency-cruiser
- **eslint-plugin-boundaries** (evaluated, not adopted — would be a new dependency):
  https://github.com/javierbrea/eslint-plugin-boundaries
- **"6 Tools for Enforcing Good Web Architecture":**
  https://jmulholland.com/architecture-tools/

## In-repo cross-references

- `server/CLAUDE.md`, `reviewer-core/CLAUDE.md` — module maps & conventions.
- `server/src/platform/container.ts` — the composition root (DI container).
- `reviewer-core/src/review/run.ts` — the pure engine entry point.
- `server/docs/`, `reviewer-core/docs/`, `reviewer-core/specs/` — design SoT.
