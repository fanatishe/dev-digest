/* EvalCaseRow — one eval case in the panel's list. Shows the imported
   ExpectationBadge(s) (MUST FIND / MUST NOT FLAG), the case name + expected ref
   ("expected"), the last run's pass/fail ("got"), an optional severity·category,
   and the prominent imported ReproRateBadge. Per-row "Run 5×" (useRunCase) and a
   confirmed Delete (useDeleteEvalCase) round out the actions.

   All finding/PR-authored content is rendered as text (never dangerouslySetInnerHTML);
   the expected_output JSON is parsed as validated data, never executed (security).
   Icon-only buttons carry an aria-label; pass/fail is text, never colour alone, so
   both a screen reader and RTL can read the verdict. Reads the `eval` namespace. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { EvalCaseWithRuns } from "@devdigest/shared";
import { useConfirm } from "@/lib/confirm";
import { useDeleteEvalCase, useRunCase } from "@/lib/hooks/evals";
import { ExpectationBadge } from "@/components/evals/ExpectationBadge";
import { ReproRateBadge } from "@/components/evals/ReproRate";
import { distinctKinds, metaLine, parseExpectations, primaryRef } from "./helpers";
import { s } from "./styles";

export function EvalCaseRow({ evalCase }: { evalCase: EvalCaseWithRuns }) {
  const t = useTranslations("eval");
  const confirm = useConfirm();
  const run = useRunCase();
  const del = useDeleteEvalCase();

  const expectations = parseExpectations(evalCase.expected_output);
  const kinds = distinctKinds(expectations);
  const ref = primaryRef(expectations);
  const meta = metaLine(expectations);
  const lastRun = evalCase.last_run;

  const unrun = !lastRun || lastRun.pass === null;
  const passLabel = unrun
    ? t("evalsTab.neverRun")
    : lastRun!.pass
      ? t("evalsTab.passed")
      : t("evalsTab.failed");
  const passColor = unrun ? "var(--text-muted)" : lastRun!.pass ? "var(--ok)" : "var(--crit)";

  async function onDelete() {
    if (await confirm({ title: t("evalsTab.delete"), message: evalCase.name, danger: true })) {
      del.mutate(evalCase.id);
    }
  }

  return (
    <li style={s.row}>
      <div style={s.main}>
        <div style={s.badges}>
          {kinds.map((k) => (
            <ExpectationBadge key={k} kind={k} />
          ))}
        </div>
        <div style={s.text}>
          <span style={s.name}>{evalCase.name}</span>
          {ref && <span style={s.ref}>{ref}</span>}
        </div>
      </div>

      {meta && <span style={s.meta}>{meta}</span>}

      <div style={s.right}>
        <Badge dot color={passColor} bg="transparent" style={{ border: "1px solid var(--border)" }}>
          {passLabel}
        </Badge>
        <ReproRateBadge repro={evalCase.repro ?? undefined} />
        <Button
          kind="ghost"
          size="sm"
          icon="Play"
          loading={run.isPending}
          aria-label={t("evalsTab.run")}
          onClick={() => run.mutate({ caseId: evalCase.id, times: 5 })}
        />
        <Button
          kind="ghost"
          size="sm"
          icon="Trash"
          loading={del.isPending}
          aria-label={t("evalsTab.delete")}
          onClick={onDelete}
        />
      </div>
    </li>
  );
}

export default EvalCaseRow;
