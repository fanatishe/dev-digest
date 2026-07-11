/* PR Detail — /repos/:repoId/pulls/:number. Thin Server Component: owns metadata
   and hands the (awaited) route params to the colocated client view. The screen
   body — header + Overview/Findings/Diff tabs + run-trace drawer, all its data
   hooks and URL-query state — lives in _components/PrDetailView. */
import type { Metadata } from "next";
import { PrDetailView } from "./_components/PrDetailView";

// Title comes straight from the route param — no data fetch needed. Renders
// "PR #123 · DevDigest" via the root title template.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ repoId: string; number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  return { title: `PR #${number}` };
}

// Next 15: route `params` are async — await before use.
export default async function PRDetailPage({
  params,
}: {
  params: Promise<{ repoId: string; number: string }>;
}) {
  const { repoId, number } = await params;
  return <PrDetailView repoId={repoId} number={number} />;
}
