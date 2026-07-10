/* Add-repository route — /onboarding. Thin SERVER wrapper; the interactive
   screen lives in the client component _components/AddRepoView. Keeping the page
   a Server Component (no client directive here) lets it own page metadata. */
import type { Metadata } from "next";
import { AddRepoView } from "./_components/AddRepoView";

export const metadata: Metadata = { title: "Add repository" };

export default function AddRepoPage() {
  return <AddRepoView />;
}
