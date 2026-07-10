# frontend-ui-architecture

**Version:** 1.0.0 · **Scope:** Frontend · **Status:** Stable

Frontend **UI architecture** skill for React + Next.js (App Router). The accent is on
**code structure and organization** — *where does each piece of frontend code live?* —
not on component internals or framework APIs.

## Focus

Given any piece of frontend code, this skill answers **where it goes** and **how the
folders relate**:

- Folder/file layout for a React + Next.js App Router app (`src/app`, `components`,
  `lib`, `vendor`, `messages`, `test`).
- Thin route pages vs. colocated feature components (`_components/`).
- Route-scoped vs. shared placement, and the promotion rule between them.
- Per-component folder anatomy: `Component.tsx`, `.test.tsx`, `index.ts`, `constants.ts`,
  `helpers.ts`, `styles.ts`, nested `_components/`.
- Where **business logic**, **constants**, **helpers/utils**, **styles**, **types**, and
  **data-fetching hooks** belong.
- Layering & dependency direction (no sideways/upward imports; one entry to the network).
- Barrel-file policy (cheap per-component re-exports ✅ vs. wide aggregation barrels ❌).
- Naming conventions and the colocation principle.

Grounded in the DevDigest `client/` package, so guidance matches this repo's reality;
the underlying principles are portable to any React/Next project.

## What it covers

| File | Contents |
|------|----------|
| [SKILL.md](SKILL.md) | The canonical layout, layering rules, component anatomy, the "where does X go?" table, barrel/naming/promotion rules. Load this first. |
| [structure.md](structure.md) | Annotated folder tree + a full decision tree for placing new code, and the component/view/widget vocabulary. |
| [examples.md](examples.md) | Good vs. bad structural patterns (thin pages, folder anatomy, hooks vs. fetch-in-component, promotion, barrels, contracts). |

## When to use it

Reach for this skill when the question is about **placement or organization**:

- Starting a new screen, feature, or component and deciding the folder layout.
- Reviewing a PR for structure: thin pages, colocation, layer boundaries, barrels.
- Refactoring a bloated component or file into the right folders.
- Deciding whether code should be route-scoped or promoted to shared.
- Placing constants, helpers, styles, types, or data-fetching hooks.
- Onboarding: understanding how the `client/` package is organized and why.

Do **not** use it for component/hook internals or framework mechanics — see below.

## Relationship to other skills (clear boundaries)

This skill is deliberately **architecture-only** and cross-links the other two rather
than duplicating them:

| Skill | Owns | Example questions |
|-------|------|-------------------|
| **frontend-ui-architecture** (this) | **Macro structure** — folders, files, layering, where code lives | "Where does this helper/hook/constant go?" "Route-scoped or shared?" "Thin page?" |
| [react-best-practices](../react-best-practices/SKILL.md) | **Component/hook internals** — derive-don't-store, `useEffect` misuse, memoization, keys, conditional rendering | "Should this be `useMemo`?" "Is this `useEffect` misused?" |
| [next-best-practices](../next-best-practices/SKILL.md) | **Framework APIs** — RSC boundaries, async `params`/`searchParams`, metadata, route handlers, image/font | "Is this a valid Server Component?" "How do I read `searchParams`?" |

Rule of thumb: **placement → here; implementation → the other two.** When a topic
overlaps (e.g. "business logic in hooks"), this skill says *which folder the hook lives
in*; `react-best-practices` says *how to write the hook*.

## Versioning

Semantic versioning. The current version is declared in `SKILL.md` frontmatter
(`version:`) and here.

- **MAJOR** — a prescribed structure changes in a breaking way (e.g. a different
  canonical layout), so existing code would need to move.
- **MINOR** — new guidance, sections, or examples added; existing rules unchanged.
- **PATCH** — clarifications, typo/link fixes, wording.

### Changelog

- **1.0.0** — Initial release. Canonical React + Next.js App Router layout grounded in
  DevDigest `client/`; layering rules; component folder anatomy; "where does X go?"
  decision tree; barrel-file, naming, and promotion policies; examples; sourced README.

## Sources

Curated during research; grouped by topic. All were consulted for this skill and are
kept for future revisions.

### Official framework & library docs

- [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) — colocation, private `_folders`, route groups, `src/`, the three "organize your project" strategies.
- [Next.js — Routing: Colocation (v13 docs)](https://nextjs.org/docs/13/app/building-your-application/routing/colocation) — original colocation write-up.
- [Next.js — `src` folder convention](https://nextjs.org/docs/app/api-reference/file-conventions/src-folder)
- [Next.js — Route groups convention](https://nextjs.org/docs/app/api-reference/file-conventions/route-groups)

### Reference architectures

- [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — feature-based layout, no cross-feature imports, unidirectional `shared → features → app`, ESLint boundaries, stance against barrel files.
- [Feature-Sliced Design — home](https://feature-sliced.design/) · [docs](https://feature-sliced.design/docs) · [Scalable React architecture](https://feature-sliced.design/blog/scalable-react-architecture) — layers → slices → segments, unidirectional dependencies.
- [next-colocation-template (arhamkhnz)](https://github.com/arhamkhnz/next-colocation-template) — a colocation-first App Router template.

### Colocation & locality of behavior

- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) — "place code as close to where it's relevant as possible."
- [Kent C. Dodds — State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- [Kent C. Dodds — Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react)
- [Matias Kinnunen — Locality of Behavior / Co-location](https://mtsknn.fi/blog/locality-of-behavior-and-co-location/)

### Folder-structure guides

- [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/) — horizontal scaling within a component folder (`constants.ts`, `utils.ts`); plural bundle-file naming.
- [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) — per-component folders + barrel, `hooks`/`helpers`/`utils`/`constants` split, aliases.
- [Web Dev Simplified — How To Structure React Projects](https://blog.webdevsimplified.com/2022-07/react-folder-structure/)
- [profy.dev — Screaming Architecture / React folder structures](https://profy.dev/article/react-folder-structure)
- [React Handbook — Project Standards](https://reacthandbook.dev/project-standards)
- [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/)

### Business logic, separation of concerns & component patterns

- [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/)
- [patterns.dev — Container/Presentational Pattern](https://www.patterns.dev/react/presentational-container-pattern/)
- [TSH — Container-presentational pattern in React](https://tsh.io/blog/container-presentational-pattern-react)
- [Khalil Stemmler — Client-Side Architecture Principles](https://khalilstemmler.com/articles/client-side-architecture/principles)

### Barrel files & bundle impact

- [Burn the Barrel! (Brett Uglow)](https://uglow.medium.com/burn-the-barrel-c282578f21b6) — why aggregation barrels hurt.
- [webpack Discussion #16863 — barrel files & tree-shaking](https://github.com/webpack/webpack/discussions/16863)
- [vercel/next.js #12557 — tree-shaking with TS barrel files](https://github.com/vercel/next.js/issues/12557)
- [Catch Metrics — Next.js barrel-file bundle-size improvements](https://www.catchmetrics.io/blog/nextjs-bundle-size-improvements-optimize-your-performance)

### Design-system structure

- [Brad Frost — Atomic Design (Chapter 2)](https://atomicdesign.bradfrost.com/chapter-2/) — atoms → molecules → organisms → templates → pages; a mental model for the `vendor/ui` design system layer.
