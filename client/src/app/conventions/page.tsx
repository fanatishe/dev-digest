import type { Metadata } from "next";
import { ConventionsWorkbench } from "./_components/ConventionsWorkbench";

/* Route: /conventions (Skills Lab → Conventions). Thin Server Component owning
   metadata; the scan/list/accept view + the "create skill" modal live under
   _components. Scans the active repo's clone for house-style conventions. */
export const metadata: Metadata = { title: "Conventions" };

export default function ConventionsPage() {
  return <ConventionsWorkbench />;
}
