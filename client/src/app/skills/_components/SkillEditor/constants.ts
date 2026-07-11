import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills.editor.tabs` namespace. */
export interface SkillTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const TABS: readonly SkillTab[] = [
  { key: "config", labelKey: "config", icon: "Settings" },
  { key: "preview", labelKey: "preview", icon: "Eye" },
  { key: "evals", labelKey: "evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "stats", icon: "BarChart" },
  { key: "versions", labelKey: "versions", icon: "History" },
];
