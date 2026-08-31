import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. Config + Skills + Context + Evals; later lessons add Stats/CI.
    The Context tab's label resolves under the `projectContext` namespace (see
    AgentEditor), so its `labelKey` is unused and left blank. The `evals` key must
    stay identical to `AgentDetailView`'s `VALID_TABS` entry, or the `?tab=evals`
    deep-link falls back to config and the tab never mounts (client INSIGHTS). */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "", icon: "Layers" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" },
];
