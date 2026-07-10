import React from "react";
import { Modal } from "./Modal";
import { Button } from "../primitives";

/**
 * Accessible confirmation dialog — the design-system replacement for the native,
 * thread-blocking `window.confirm`. Built on `Modal` (focus trap, Escape, restore
 * focus). Cancel is `autoFocus`ed as the safe default for destructive actions.
 *
 * Prefer driving this via the app's promise-based `useConfirm()` provider rather
 * than wiring open/close state by hand at every call site.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      width={440}
      title={title}
      // Block backdrop/Escape dismissal while the confirmed action is in flight.
      onClose={busy ? undefined : onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button kind="secondary" onClick={onCancel} disabled={busy} autoFocus>
            {cancelLabel}
          </Button>
          <Button kind={danger ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {message != null && (
        <div style={{ padding: "20px 24px", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.55 }}>
          {message}
        </div>
      )}
    </Modal>
  );
}
