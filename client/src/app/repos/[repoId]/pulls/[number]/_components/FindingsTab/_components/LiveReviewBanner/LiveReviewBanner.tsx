"use client";

import { SectionLabel, Button } from "@devdigest/ui";
import { RunStatus } from "../../../RunStatus";
import { s } from "../../styles";

/** Top-of-tab banner shown while one or more runs are live: cancel-all /
 *  open-trace actions + the live RunStatus stream. Renders nothing when idle. */
export function LiveReviewBanner({
  liveRunIds,
  cancelPending,
  onCancelAll,
  onOpenFirstTrace,
  onRunDone,
}: {
  liveRunIds: string[];
  cancelPending: boolean;
  onCancelAll: () => void;
  onOpenFirstTrace: () => void;
  onRunDone: () => void;
}) {
  if (liveRunIds.length === 0) return null;
  return (
    <div style={s.liveRunSection}>
      <SectionLabel
        icon="Sparkles"
        right={
          <div style={s.cancelActions}>
            <Button kind="danger" size="sm" icon="X" loading={cancelPending} onClick={onCancelAll}>
              Cancel
            </Button>
            <Button kind="ghost" size="sm" icon="FileText" onClick={onOpenFirstTrace}>
              Open run trace
            </Button>
          </div>
        }
      >
        Live review
      </SectionLabel>
      <RunStatus runIds={liveRunIds} onDone={onRunDone} />
    </div>
  );
}
