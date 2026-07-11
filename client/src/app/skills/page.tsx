import type { Metadata } from "next";
import { SkillsWorkbench } from "./_components/SkillsWorkbench";

/* Route: /skills (Skills library). Thin Server Component owning metadata; the
   master–detail view + its editor tabs and drawers live under _components. With no
   :id selected it shows the list + a "select a skill" prompt. */
export const metadata: Metadata = { title: "Skills" };

export default function SkillsPage() {
  return <SkillsWorkbench />;
}
