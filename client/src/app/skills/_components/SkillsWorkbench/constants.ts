import type { SkillType } from "@devdigest/shared";

/** A stable accent colour per skill type (used by the card + editor type badge). */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--accent)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};
