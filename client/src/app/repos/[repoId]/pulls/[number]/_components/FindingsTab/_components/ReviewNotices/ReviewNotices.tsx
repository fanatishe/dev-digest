"use client";

import { Icon, Badge } from "@devdigest/ui";
import { s } from "../../styles";

/** Passive status banners under the live section: "review in progress" spinner
 *  and the Lethal-Trifecta alert. Each shows only when relevant. */
export function ReviewNotices({
  reviewRunning,
  lethalCount,
}: {
  reviewRunning: boolean;
  lethalCount: number;
}) {
  return (
    <>
      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>Review in progress…</span>
          <span style={s.reviewInProgressSub}>
            the agent is analyzing the diff — this can take a while on large PRs.
          </span>
        </div>
      )}

      {lethalCount > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>Lethal Trifecta detected</span>
          <Badge color="var(--crit)" bg="transparent">
            {lethalCount} finding(s)
          </Badge>
        </div>
      )}
    </>
  );
}
