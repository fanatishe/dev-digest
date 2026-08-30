/* EvalCaseModal — turn a finding (or a blank slate, for the SkillEditor) into a
   saved eval case. Lives in the shared components/evals ring so both the pulls
   FindingsPanel (downward import) and WP-F's EvalsPanel can open it.

   - Seeds the Diff/Files/PR-meta tabs from usePullDetail(prId) and pre-fills the
     expected-output JSON from the finding (accepted -> must_find, dismissed ->
     must_not_flag) (AC-1).
   - Save disabled while the JSON is not a valid EvalExpectedOutput (AC-4); Save ->
     POST /eval/cases with owner_id = the finding's review agent_id (AC-2).
   - "Run on save" runs the case once and shows a ReproRateStrip; with no key the
     run surfaces a non-throwing error state, never a crash (AC-5, AC-27).

   All data flows through WP-D hooks — this component never calls fetch/api, and all
   PR/finding content is rendered as text (never dangerouslySetInnerHTML). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, TextInput, Toggle } from "@devdigest/ui";
import type {
  EvalCaseInput,
  EvalCaseWithRuns,
  EvalOwnerKind,
  FindingRecord,
  PrFile,
} from "@devdigest/shared";
import { usePullDetail } from "@/lib/hooks/core";
import {
  useCaseRuns,
  useCreateEvalCase,
  useRunCase,
  useUpdateEvalCase,
} from "@/lib/hooks/evals";
import { ExpectationBadge } from "@/components/evals/ExpectationBadge";
import { ReproRateStrip } from "@/components/evals/ReproRate";
import { JsonEditorField } from "./_components/JsonEditorField";
import { InputTabs, type InputTabKey } from "./_components/InputTabs";
import { InputAuthor, type AuthorState } from "./_components/InputAuthor";
import { buildUnifiedDiff, splitUnifiedDiff } from "./diff";
import {
  deriveKind,
  initialExpectedOutput,
  lineRef,
  parseExpected,
  seedDiff,
  seedName,
  stringifyExpected,
  withSkeleton,
} from "./helpers";
import { s } from "./styles";

export interface EvalCaseModalProps {
  /** Owner the case attributes to (agent for a finding-derived case, AC-2). */
  owner: { kind: EvalOwnerKind; id: string };
  /** The finding to seed from; omit for a blank create (WP-F skill tab). */
  finding?: FindingRecord | null;
  /** The PR whose detail seeds the Diff/Files/PR-meta tabs (AC-1). */
  prId?: string | null;
  /** An existing case to EDIT (prefilled + saved via update); omit to create. */
  existingCase?: EvalCaseWithRuns | null;
  onClose: () => void;
}

export function EvalCaseModal({ owner, finding, prId, existingCase, onClose }: EvalCaseModalProps) {
  const t = useTranslations("eval");
  const isEdit = !!existingCase;
  // A finding-derived case shows the seeded PR context read-only (AC-1); a blank
  // create OR an edit uses the editable Before/After authoring surface (InputAuthor).
  const authoring = !finding;

  const [name, setName] = React.useState(() => existingCase?.name ?? seedName(finding));
  const [expectedText, setExpectedText] = React.useState(() =>
    existingCase
      ? JSON.stringify(existingCase.expected_output, null, 2)
      : stringifyExpected(initialExpectedOutput(finding)),
  );
  const [activeTab, setActiveTab] = React.useState<InputTabKey>("diff");
  const [selectedFile, setSelectedFile] = React.useState<string | null>(finding?.file ?? null);
  const [runOnSave, setRunOnSave] = React.useState(false);
  const [createdCaseId, setCreatedCaseId] = React.useState<string | null>(null);
  const [author, setAuthor] = React.useState<AuthorState>(() => initialAuthorState(existingCase));
  const updateAuthor = (patch: Partial<AuthorState>) => setAuthor((a) => ({ ...a, ...patch }));

  const detail = usePullDetail(prId ?? null).data;
  const create = useCreateEvalCase();
  const update = useUpdateEvalCase();
  const run = useRunCase();
  const runsQuery = useCaseRuns(createdCaseId);

  const parsed = parseExpected(expectedText);
  const valid = parsed.ok;
  const busy = create.isPending || update.isPending || run.isPending;
  const canSave = valid && name.trim().length > 0 && !busy;

  const kind = finding ? deriveKind(finding) : "must_find";
  // The input diff/files/meta come from the authoring surface, or (finding-derived)
  // the seeded PR detail.
  const diffText = authoring
    ? buildUnifiedDiff({ file: author.file, before: author.before, after: author.after, newFile: author.mode === "new" })
    : seedDiff(detail, finding?.file);
  const sourceFiles: PrFile[] = detail?.files ?? [];
  const meta = authoring
    ? { title: author.title, body: author.body, linkedIssue: null }
    : {
        title: detail?.title ?? "",
        body: detail?.body ?? "",
        linkedIssue: detail?.linked_issue ?? null,
      };

  // The last run's actual output (a { with, without } object for skill cases), from a
  // just-triggered run or the case's stored last run — shown read-only in the modal.
  const actualOutput =
    (runsQuery.data && runsQuery.data[0]?.actual_output) ??
    existingCase?.last_run?.actual_output ??
    null;

  async function save(forceRun: boolean) {
    const expected = parseExpected(expectedText);
    if (!expected.ok || name.trim().length === 0) return;

    const input: EvalCaseInput = {
      owner_kind: owner.kind,
      owner_id: owner.id,
      name: name.trim(),
      input_diff: diffText,
      input_files: authoring ? null : (detail?.files ?? null),
      input_meta: authoring
        ? { title: author.title, body: author.body || null, linked_issue: null }
        : detail
          ? { title: detail.title, body: detail.body ?? null, linked_issue: detail.linked_issue ?? null }
          : null,
      expected_output: expected.value,
      notes: isEdit
        ? ((existingCase as { notes?: string | null }).notes ?? null)
        : finding
          ? `Seeded from finding ${finding.id}`
          : null,
    };

    let saved;
    try {
      saved = isEdit
        ? await update.mutateAsync({ id: existingCase!.id, patch: input })
        : await create.mutateAsync(input);
    } catch {
      return; // surfaced via create/update.isError; never throws mid-demo (AC-27)
    }

    if (forceRun || runOnSave) {
      setCreatedCaseId(saved.id);
      // A live run with no provider key rejects — swallow it; run.isError drives a
      // non-throwing error state in the strip area (AC-27).
      await run.mutateAsync({ caseId: saved.id, times: 1 }).catch(() => {});
      return; // keep the modal open so the run result is visible (AC-5)
    }
    onClose();
  }

  const subtitle = finding
    ? kind === "must_not_flag"
      ? t("caseModal.subtitleDismissed")
      : t("caseModal.subtitleAccepted")
    : t("caseModal.subtitleBlank");

  return (
    <Modal
      width={860}
      title={name ? t("caseModal.title", { name }) : t("caseModal.newTitle")}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <div style={s.runToggle}>
            <Toggle on={runOnSave} onChange={setRunOnSave} size={16} />
            {t("caseModal.runOnSave")}
          </div>
          <div style={s.footerActions}>
            <Button kind="ghost" onClick={onClose}>
              {t("caseModal.cancel")}
            </Button>
            <Button kind="secondary" icon="Play" disabled={!canSave} loading={run.isPending} onClick={() => save(true)}>
              {t("caseModal.runCase")}
            </Button>
            <Button kind="primary" icon="Check" disabled={!canSave} loading={create.isPending || update.isPending} onClick={() => save(false)}>
              {t("caseModal.save")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.col}>
          {finding && (
            <div style={s.expectationCard(kind === "must_find")}>
              <ExpectationBadge kind={kind} />
              <span style={s.expectationDesc}>
                {kind === "must_find"
                  ? t("caseModal.mustFindDesc", { title: finding.title, ref: lineRef(finding) })
                  : t("caseModal.mustNotFlagDesc", { title: finding.title, ref: lineRef(finding) })}
              </span>
            </div>
          )}

          <label>
            <div style={s.fieldLabel}>
              {t("caseModal.nameLabel")}
              <span style={s.required}>*</span>
            </div>
            <TextInput value={name} onChange={setName} placeholder={t("caseModal.namePlaceholder")} mono />
          </label>

          <div>
            <div style={s.fieldLabel}>{t("caseModal.inputLabel")}</div>
            {authoring ? (
              <InputAuthor value={author} onChange={updateAuthor} />
            ) : (
              <InputTabs
                active={activeTab}
                onTab={setActiveTab}
                diffText={diffText}
                files={sourceFiles}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
                meta={meta}
              />
            )}
          </div>
        </div>

        <div style={s.col}>
          <JsonEditorField
            value={expectedText}
            onChange={setExpectedText}
            valid={valid}
            onInsertSkeleton={() => setExpectedText((text) => withSkeleton(text))}
          />

          {actualOutput != null && (
            <div>
              <div style={s.fieldLabel}>{t("caseModal.actualOutput")}</div>
              <pre style={s.filePreview}>{JSON.stringify(actualOutput, null, 2)}</pre>
            </div>
          )}

          {createdCaseId && (
            <div style={s.runResultWrap}>
              {run.isError ? (
                <div style={s.runError}>{t("caseModal.runError")}</div>
              ) : (
                <ReproRateStrip runs={runsQuery.data ?? []} />
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Seed the Before/After authoring state — reconstructed from a case being edited
    (its stored diff/meta), or a blank slate for a new case. */
function initialAuthorState(existing?: EvalCaseWithRuns | null): AuthorState {
  if (existing) {
    const parts = splitUnifiedDiff(existing.input_diff ?? "");
    const m = existing.input_meta as { title?: string; body?: string | null } | null | undefined;
    return {
      file: parts.file,
      mode: parts.newFile ? "new" : "modified",
      before: parts.before,
      after: parts.after,
      title: m?.title ?? "",
      body: m?.body ?? "",
    };
  }
  return { file: "snippet.ts", mode: "modified", before: "", after: "", title: "", body: "" };
}
