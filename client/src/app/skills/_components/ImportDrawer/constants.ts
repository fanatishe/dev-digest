import type { CommunitySkill } from "@devdigest/shared";

/** A small static catalog for the Community tab (no backend registry yet). Each
 *  entry carries a starter body imported as untrusted + disabled-until-vetted. */
export interface CommunityCatalogItem extends CommunitySkill {
  body: string;
}

export const COMMUNITY_CATALOG: CommunityCatalogItem[] = [
  {
    name: "owasp-top-10-gate",
    repo: "devdigest/community-skills",
    stars: 1240,
    lang: "any",
    desc: "Flag OWASP Top 10 categories touched by the diff (injection, access control, SSRF…).",
    body: "# OWASP Top 10 gate\nFor each changed file, check whether it introduces an OWASP Top 10 issue: injection, broken access control, SSRF, insecure deserialization, secrets, or misconfig. Cite the exact line and category.",
  },
  {
    name: "sql-n-plus-one",
    repo: "devdigest/community-skills",
    stars: 860,
    lang: "typescript",
    desc: "Detect N+1 query patterns and missing indexes on hot paths.",
    body: "# N+1 queries\nFlag loops that issue one query per element, ORM lazy-loads inside iteration, and filters on unindexed columns on a hot path. Suggest a single batched query.",
  },
  {
    name: "conventional-commits",
    repo: "devdigest/community-skills",
    stars: 410,
    lang: "any",
    desc: "Require Conventional Commits style and a scoped, imperative subject.",
    body: "# Conventional commits\nRequire commit subjects in the form type(scope): imperative summary. Flag missing type, non-imperative mood, or a subject over 72 chars.",
  },
  {
    name: "a11y-jsx",
    repo: "devdigest/community-skills",
    stars: 705,
    lang: "typescript",
    desc: "Catch missing alt text, unlabeled controls, and non-semantic handlers in JSX.",
    body: "# JSX accessibility\nFlag <img> without alt, form controls without a label/aria-label, click handlers on non-interactive elements without role+key handling, and missing focus states.",
  },
];

export const COMMUNITY_LANGS = ["any", "typescript"] as const;
