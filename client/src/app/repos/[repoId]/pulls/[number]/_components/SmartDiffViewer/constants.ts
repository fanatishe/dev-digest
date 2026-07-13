/** Constants for SmartDiffViewer. */
import type { SmartDiffRole } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Group render order — the reading order the whole feature exists for. */
export const ROLE_ORDER = ["core", "wiring", "boilerplate"] as const;

/** Per-role presentation. Labels/descriptions are i18n KEYS, never literals. */
export const ROLE_META: Record<SmartDiffRole, { icon: IconName; labelKey: string; descKey: string }> = {
  core: { icon: "Code", labelKey: "smartDiff.coreLabel", descKey: "smartDiff.coreDesc" },
  wiring: { icon: "Wrench", labelKey: "smartDiff.wiringLabel", descKey: "smartDiff.wiringDesc" },
  boilerplate: {
    icon: "Boxes",
    labelKey: "smartDiff.boilerplateLabel",
    descKey: "smartDiff.boilerplateDesc",
  },
};

/** The one group that renders collapsed: nobody reads a lock file top-to-bottom. */
export const COLLAPSED_ROLE: SmartDiffRole = "boilerplate";
