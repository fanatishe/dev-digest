"use client";

import { Skeleton } from "@devdigest/ui";

/** Loading placeholder for the PR detail body (title + subtitle + content). */
export function PrDetailSkeleton() {
  return (
    <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto" }}>
      <Skeleton height={28} width={420} />
      <Skeleton height={16} width={300} />
      <Skeleton height={200} />
    </div>
  );
}
