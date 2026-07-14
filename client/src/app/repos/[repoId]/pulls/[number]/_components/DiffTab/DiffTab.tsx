/* DiffTab — the Files-changed tab. Owns the hooks (comments · smart diff · intent)
   and the Smart/Original order toggle; the two viewers below it are presentational.

   Smart order is the default: files regrouped core → wiring → boilerplate, the
   boilerplate group collapsed, the intent context header on top, and a severity
   badge on every flagged line. Original order renders today's flat DiffViewer
   unchanged — it is also the fallback while the smart-diff query is loading or if
   it errors, so this tab is never worse than it was. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFinding } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { useIntent } from "@/lib/hooks/intent";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { SmartDiffViewer } from "../SmartDiffViewer";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Findings of the latest review — the badge anchors. Empty when never reviewed. */
  findings: DiffFinding[];
  /** Deep-link a badge to its finding on the Findings tab (one replace, no reload). */
  onOpenFinding: (id: string) => void;
  /** `?file=` — a path to scroll to, set when the Blast card reveals a changed symbol. */
  targetFile?: string | null;
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  findings,
  onOpenFinding,
  targetFile,
  canComment,
}: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smart } = useSmartDiff(prId);
  const { data: intent } = useIntent(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [order, setOrder] = React.useState<"smart" | "original">("smart");

  const commentCount = comments?.length ?? 0;
  // Derived, not stored: no smart diff (still loading, or the query errored) just
  // means the flat viewer — which is always correct.
  const showSmart = order === "smart" && !!smart;

  // `?file=` reveal — the Blast card's "show me this changed symbol in the diff".
  //
  // Depends on `showSmart` as well as `targetFile`: the two viewers mount different
  // DOM, and the smart-diff query resolves AFTER this tab first renders. Keying the
  // effect on `targetFile` alone would run it against the flat viewer, then never
  // again once the smart viewer swapped in — the scroll would land on a node that no
  // longer exists. `FileCard` carries `data-path` in both viewers, so once the right
  // one is mounted this finds it.
  React.useEffect(() => {
    if (!targetFile) return;
    const el = document.querySelector(`[data-path="${CSS.escape(targetFile)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targetFile, showSmart]);

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("smartDiff.commentFailed"));
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Labelled by the ACTION, like the comments toggle beside it: while
                Smart order is showing, the button offers Original order. */}
            {smart && (
              <Button
                kind="ghost"
                size="sm"
                icon={order === "smart" ? "FileText" : "Layers"}
                onClick={() => setOrder((o) => (o === "smart" ? "original" : "smart"))}
              >
                {order === "smart" ? t("smartDiff.originalOrder") : t("smartDiff.smartOrder")}
              </Button>
            )}
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments
                  ? t("smartDiff.hideComments", { count: commentCount })
                  : t("smartDiff.showComments", { count: commentCount })}
              </Button>
            )}
          </div>
        }
      >
        {t("smartDiff.filesChanged", { count: filesCount })}
      </SectionLabel>

      {showSmart && smart ? (
        <SmartDiffViewer
          smart={smart}
          files={files}
          findings={findings}
          intent={intent ?? null}
          commenting={commenting}
          onOpenFinding={onOpenFinding}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
