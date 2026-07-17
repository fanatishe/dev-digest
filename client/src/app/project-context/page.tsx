import type { Metadata } from "next";
import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /project-context (Skills Lab → Project Context). Thin Server Component
   owning metadata; the discovery list, filter, and preview drawer live under
   _components. Lists the active repo's `.md` under the configured roots (SPEC-01). */
export const metadata: Metadata = { title: "Project Context" };

export default function ProjectContextPage() {
  return <ProjectContextView />;
}
