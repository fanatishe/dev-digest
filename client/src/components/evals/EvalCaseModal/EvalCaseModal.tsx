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
  EvalOwnerKind,
  FindingRecord,
} from "@devdigest/shared";
import { usePullDetail } from "@/lib/hooks/core";
import { useCaseRuns, useCreateEvalCase, useRunCase } from "@/lib/hooks/evals";
import { ExpectationBadge } from "@/components/evals/ExpectationBadge";
import { ReproRateStrip } from "@/components/evals/ReproRate";
import { JsonEditorField } from "./_components/JsonEditorField";
import { InputTabs, type InputTabKey } from "./_components/InputTabs";
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
  onClose: () => void;
}

export function EvalCaseModal({ owner, finding, prId, onClose }: EvalCaseModalProps) {
  const t = useTranslations("eval");

  const [name, setName] = React.useState(() => seedName(finding));
  const [expectedText, setExpectedText] = React.useState(() =>
    stringifyExpected(initialExpectedOutput(finding)),
  );
  const [activeTab, setActiveTab] = React.useState<InputTabKey>("diff");
  const [selectedFile, setSelectedFile] = React.useState<string | null>(finding?.file ?? null);
  const [runOnSave, setRunOnSave] = React.useState(true);
  const [createdCaseId, setCreatedCaseId] = React.useState<string | null>(null);

  const detail = usePullDetail(prId ?? null).data;
  const create = useCreateEvalCase();
  const run = useRunCase();
  const runsQuery = useCaseRuns(createdCaseId);

  const parsed = parseExpected(expectedText);
  const valid = parsed.ok;
  const canSave = valid && name.trim().length > 0 && !create.isPending && !run.isPending;

  const kind = finding ? deriveKind(finding) : "must_find";
  const diffText = seedDiff(detail, finding?.file);
  const meta = {
    title: detail?.title ?? "",
    body: detail?.body ?? "",
    linkedIssue: detail?.linked_issue ?? null,
  };

  async function save(forceRun: boolean) {
    const expected = parseExpected(expectedText);
    if (!expected.ok || name.trim().length === 0) return;

    const input: EvalCaseInput = {
      owner_kind: owner.kind,
      owner_id: owner.id,
      name: name.trim(),
      input_diff: diffText,
      input_files: detail?.files ?? null,
      input_meta: detail
        ? { title: detail.title, body: detail.body ?? null, linked_issue: detail.linked_issue ?? null }
        : null,
      expected_output: expected.value,
      notes: finding ? `Seeded from finding ${finding.id}` : null,
    };

    let created;
    try {
      created = await create.mutateAsync(input);
    } catch {
      return; // surfaced via create.isError; never throws mid-demo (AC-27)
    }

    if (forceRun || runOnSave) {
      setCreatedCaseId(created.id);
      // A live run with no provider key rejects — swallow it; run.isError drives a
      // non-throwing error state in the strip area (AC-27).
      await run.mutateAsync({ caseId: created.id, times: 1 }).catch(() => {});
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
            <Button kind="primary" icon="Check" disabled={!canSave} loading={create.isPending} onClick={() => save(false)}>
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
            <InputTabs
              active={activeTab}
              onTab={setActiveTab}
              diffText={diffText}
              files={detail?.files ?? []}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              meta={meta}
            />
          </div>
        </div>

        <div style={s.col}>
          <JsonEditorField
            value={expectedText}
            onChange={setExpectedText}
            valid={valid}
            onInsertSkeleton={() => setExpectedText((text) => withSkeleton(text))}
          />

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
