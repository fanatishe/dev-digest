"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { PrCommit } from "@devdigest/shared";

// Commits are markers, not actions — lighter (dashed, transparent) so they read
// as separators between the runs they sit chronologically between.
const commitRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px dashed var(--border)",
  background: "transparent",
};

/** A commit marker in the PR timeline (short sha + subject + author + time). */
export function CommitRow({ commit }: { commit: PrCommit }) {
  const c = commit;
  return (
    <div style={commitRowStyle}>
      <Icon.GitCommit size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
        {c.sha.slice(0, 7)}
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: "var(--text-secondary)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={c.message}
      >
        {c.message.split("\n")[0]}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{c.author}</span>
      {c.committed_at && (
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
          {new Date(c.committed_at).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
