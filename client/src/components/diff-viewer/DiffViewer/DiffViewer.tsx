/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell");

  // `path` is the React key, so a repeated path is not a cosmetic warning — React
  // duplicates/omits children and the page breaks. The API guarantees one entry per
  // path, but this is the LAST line of defence before a render: a bad row should
  // degrade to "we showed the file once", never to a broken diff. Last one wins,
  // matching the server's dedupe.
  const unique = React.useMemo(
    () => [...new Map((files ?? []).map((f) => [f.path, f])).values()],
    [files],
  );

  if (unique.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {unique.map((f) => (
        <FileCard key={f.path} file={f} commenting={commenting} />
      ))}
    </div>
  );
}
