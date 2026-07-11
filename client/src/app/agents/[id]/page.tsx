/* /agents/:id — Agent editor route. Thin Server Component: it owns metadata and
   hands the (awaited) route param to the colocated client view. The screen body
   — agent list + Config editor, data hooks, tab state — lives in
   _components/AgentDetailView. */
import type { Metadata } from "next";
import { AgentDetailView } from "./_components/AgentDetailView";

// Static title (renders "Edit agent · DevDigest" via the root template). A
// per-agent name would need a server-side data read; we keep pages off direct
// `api` access per the module convention (client data goes through hooks), so
// the live agent name is surfaced in the in-page breadcrumb/header instead.
export const metadata: Metadata = { title: "Edit agent" };

// Next 15: route `params` are async — await before use.
export default async function AgentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentDetailView id={id} />;
}
