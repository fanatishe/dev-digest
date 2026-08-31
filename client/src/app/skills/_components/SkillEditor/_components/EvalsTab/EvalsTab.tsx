/* SkillEditor Evals tab — renders the SAME shared, owner-agnostic EvalsPanel as the
   AgentEditor tab, scoped to this skill: allowFromFinding=false (skill cases are
   standalone, not finding-derived) and no dashboard link (the Eval Dashboard lists
   agents only — spec AC-18 / AC-20).

   EvalsTab takes no props and SkillEditor (owned by another WP) renders it as
   `<EvalsTab />`, so the skill id comes from the `/skills/[id]` route param. This
   tab only mounts for a saved skill, so the param is always present and matches the
   selected skill. A missing param degrades to an empty render, never a throw (AC-27). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { EvalsPanel } from "@/components/evals/EvalsPanel";

export function EvalsTab() {
  const params = useParams<{ id: string | string[] }>();
  const raw = params?.id;
  const skillId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!skillId) return null;

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <EvalsPanel owner={{ kind: "skill", id: skillId }} allowFromFinding={false} />
    </div>
  );
}

export default EvalsTab;
