import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over name + description + type. */
export function filterSkills(skills: Skill[], q: string): Skill[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return skills;
  return skills.filter((s) =>
    [s.name, s.description, s.type].some((f) => f.toLowerCase().includes(needle)),
  );
}

/** A skill from an untrusted source that hasn't been vetted (enabled) yet. */
export function needsVetting(skill: Pick<Skill, "source" | "enabled">): boolean {
  return skill.source !== "manual" && !skill.enabled;
}

/** Rough token estimate (~4 chars/token) for the body editor counter. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
