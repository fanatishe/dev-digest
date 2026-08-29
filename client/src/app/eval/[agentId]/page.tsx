import type { Metadata } from "next";
import { AgentEvalDetailView } from "../_components/AgentEvalDetailView";

/* Route: /eval/:agentId — per-agent eval detail + Compare (spec AC-21/AC-23/AC-24/
   AC-29). Thin Server Component owning metadata; it awaits the async route param
   (Next 15) and hands it to the colocated "use client" view, which reads `?from&to`
   and drives the trend, runs table and Compare/Promote flow. */
export const metadata: Metadata = { title: "Agent evals" };

export default async function AgentEvalDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  return <AgentEvalDetailView agentId={agentId} />;
}
