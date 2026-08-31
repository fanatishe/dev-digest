/* PromptDiffPanel — a line diff of the two compared versions' system prompts.

   Reuses the existing, unit-tested `lineDiff` from the SkillEditor VersionsTab
   (the plan names it as the single source of the diff algorithm — importing the
   pure helper keeps one implementation rather than a divergent copy). When either
   version's config could not be resolved the server sends an empty prompt; this
   panel then shows "prompt unavailable" and still renders (degrade, not throw —
   AC-27 / spec edge case), so Compare never crashes mid-demo. */
"use client";

import React from "react";
// Cross-route reuse of a pure, tested helper, as directed by the plan (WP-G
// "reuse lineDiff/DiffView … VersionsTab/diff.ts"). It is imported, never edited.
import { lineDiff } from "@/app/skills/_components/SkillEditor/_components/VersionsTab/diff";
import { COPY } from "./constants";
import { s } from "./styles";

function hasPrompt(p: string | null | undefined): p is string {
  return typeof p === "string" && p.trim().length > 0;
}

export function PromptDiffPanel({
  basePrompt,
  headPrompt,
  baseLabel,
  headLabel,
}: {
  basePrompt: string | null | undefined;
  headPrompt: string | null | undefined;
  baseLabel?: string;
  headLabel?: string;
}) {
  // If either prompt is missing, degrade to a notice instead of diffing against "".
  if (!hasPrompt(basePrompt) || !hasPrompt(headPrompt)) {
    return (
      <div style={s.panel}>
        <div style={s.header}>{COPY.title}</div>
        <div style={s.unavailable}>{COPY.unavailable}</div>
      </div>
    );
  }

  const rows = lineDiff(basePrompt, headPrompt);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span>{COPY.title}</span>
        <span style={s.legend}>
          <span style={s.legendDel}>− {baseLabel ?? COPY.base}</span>
          <span style={s.legendAdd}>+ {headLabel ?? COPY.head}</span>
        </span>
      </div>
      <pre style={s.diff}>
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              ...s.line,
              ...(row.type === "add" ? s.add : row.type === "del" ? s.del : s.ctx),
            }}
          >
            <span style={s.sign}>{row.type === "add" ? "+" : row.type === "del" ? "−" : " "}</span>
            {row.text || " "}
          </div>
        ))}
      </pre>
    </div>
  );
}

export default PromptDiffPanel;
