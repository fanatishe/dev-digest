import type { Metadata } from "next";
import { AgentsListView } from "./_components/AgentsListView";

/* Route: /agents (Agents list). Thin server entry — the view, its create modal,
   styles, constants, helpers and i18n are colocated under _components/AgentsListView.
   Being a Server Component lets it set page metadata (a client page can't). */
export const metadata: Metadata = { title: "Agents" };

export default function AgentsPage() {
  return <AgentsListView />;
}
