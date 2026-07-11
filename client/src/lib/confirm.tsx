/* confirm.tsx — promise-based confirmation, the accessible replacement for the
   native blocking `window.confirm`. A single <ConfirmDialog> is rendered by the
   provider; `useConfirm()` returns a function that opens it and resolves to the
   user's choice, so call sites read almost like the old API:

     const confirm = useConfirm();
     if (await confirm({ title: "Delete agent?", danger: true })) del.mutate(id);

   Works from components AND hooks (e.g. the app-shell repo remover). */
"use client";

import React from "react";
import { ConfirmDialog } from "@devdigest/ui";

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = React.createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        // If a confirm is already open, settle it as cancelled before replacing
        // it — otherwise the earlier promise would never resolve (dangling await).
        setPending((prev) => {
          prev?.resolve(false);
          return { ...opts, resolve };
        });
      }),
    [],
  );

  // Resolving inside the updater keeps the pending promise and the rendered
  // dialog in lockstep; a double-invoke (StrictMode) is harmless since a Promise
  // ignores a second resolve.
  const settle = React.useCallback((ok: boolean) => {
    setPending((p) => {
      p?.resolve(ok);
      return null;
    });
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          title={pending.title}
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          danger={pending.danger}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmCtx.Provider>
  );
}
