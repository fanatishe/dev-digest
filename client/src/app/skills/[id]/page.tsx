import type { Metadata } from "next";
import { SkillsWorkbench } from "../_components/SkillsWorkbench";

/* Route: /skills/:id (Skills library with a selected skill). Thin Server Component:
   owns metadata and hands the (awaited) route param to the shared workbench view. */
export const metadata: Metadata = { title: "Skill" };

// Next 15: route `params` are async — await before use.
export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SkillsWorkbench id={id} />;
}
