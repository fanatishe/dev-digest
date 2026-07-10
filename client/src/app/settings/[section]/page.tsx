import type { Metadata } from "next";
import { SettingsView } from "./_components/SettingsView";

/* Route: /settings/:section. Thin route entry — the view, its section panels,
   styles, constants and i18n are colocated under _components/SettingsView. */

/* Per-section tab titles. Source of truth for the sections themselves is
   `SETTINGS_SECTIONS` (@devdigest/ui); mirrored here (small, rarely changes) so
   this server metadata function stays off the client-component barrel. */
const SECTION_TITLES: Record<string, string> = {
  "api-keys": "API Keys",
  models: "Models",
};

// Next 15: route `params` are async — await them before use.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const label = SECTION_TITLES[section];
  return { title: label ? `${label} · Settings` : "Settings" };
}

export default function SettingsPage() {
  return <SettingsView />;
}
