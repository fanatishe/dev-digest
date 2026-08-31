/* JsonEditorField — the expected-output editor: a CodeEditor plus a live
   "valid JSON / invalid JSON" badge and a "+ Finding skeleton" insert. The parent
   owns the text + validity (parsed once there); this is presentational. The badge
   is text (not colour alone) so RTL can assert AC-4 by role/text. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Button, CodeEditor } from "@devdigest/ui";
import { s } from "../styles";

export function JsonEditorField({
  value,
  onChange,
  valid,
  onInsertSkeleton,
}: {
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
  onInsertSkeleton: () => void;
}) {
  const t = useTranslations("eval");
  return (
    <div>
      <div style={s.editorHeader}>
        <span style={s.fieldLabel}>{t("caseModal.expectedOutput")}</span>
        <Badge
          icon={valid ? "CheckCircle" : "AlertTriangle"}
          color={valid ? "var(--ok)" : "var(--crit)"}
          bg="transparent"
        >
          {valid ? t("caseModal.validJson") : t("caseModal.invalidJson")}
        </Badge>
        <span style={s.editorSpacer} />
        <Button kind="ghost" size="sm" icon="Plus" onClick={onInsertSkeleton}>
          {t("caseModal.findingSkeleton")}
        </Button>
      </div>
      <CodeEditor
        value={value}
        onChange={onChange}
        rows={16}
        ariaLabel={t("caseModal.expectedAria")}
      />
    </div>
  );
}
