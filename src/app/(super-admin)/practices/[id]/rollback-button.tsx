// EMR-748 — One-click rollback button (client).
//
// Rendered next to each non-current entry on the History tab. Opens a
// confirmation modal that requires the operator to (a) type the
// practice name verbatim and (b) provide a reason. On submit, calls the
// `rollbackPracticeConfig` server action.

"use client";

import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { rollbackPracticeConfig } from "./rollback-action";

export function RollbackButton({
  configurationId,
  targetVersion,
  practiceName,
}: {
  configurationId: string;
  targetVersion: number;
  /** Practice name the operator must type verbatim to confirm. */
  practiceName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setConfirmName("");
    setReason("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await rollbackPracticeConfig({
        configurationId,
        targetVersion,
        reason,
        confirmName,
      });
      if (result.ok === false) {
        setError(result.message);
      }
      // On success, the action redirects so we never get here.
    });
  }

  const nameMatches =
    confirmName.trim().toLowerCase() === practiceName.trim().toLowerCase();
  const canSubmit = nameMatches && reason.trim().length >= 4 && !isPending;
  // EMR-642 — once the operator has begun typing the confirmation, treat
  // the modal as dirty so a stray outside-click or Esc prompts a discard
  // confirmation rather than nuking their input.
  const isDirty = confirmName.length > 0 || reason.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-medium text-text-muted hover:text-text underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm transition-colors"
      >
        Rollback to v{targetVersion}
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !isPending) close();
        }}
        confirmCloseOnDirty
        isDirty={isDirty}
      >
        <DialogContent className="max-w-md">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-500">
              <span className="text-xl" aria-hidden="true">&#9888;</span>
              <DialogTitle className="font-display text-lg font-bold text-text tracking-tight">
                Rollback to v{targetVersion}?
              </DialogTitle>
            </div>
            
            <p className="text-[13px] text-text-muted mt-3 leading-relaxed">
              This will create a new draft configuration cloned from version <strong>v{targetVersion}</strong> and log a <code>controller.config.rollback</code> audit entry.
            </p>

            <div className="mt-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
                To confirm, type practice name verbatim
              </label>
              <div className="text-[12px] text-text-subtle mt-0.5 font-medium italic">
                Required: "{practiceName}"
              </div>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={practiceName}
                className={`mt-2 w-full rounded-lg border bg-bg px-3 py-2 text-[13px] text-text focus:outline-none focus:ring-2 transition-all ${
                  nameMatches
                    ? "border-emerald-500 focus:ring-emerald-500/20"
                    : "border-border focus:ring-accent/20"
                }`}
              />
              {confirmName && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px]">
                  {nameMatches ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      &#10003; Practice name matched
                    </span>
                  ) : (
                    <span className="text-rose-600 dark:text-rose-400 font-medium">
                      &#10007; Name does not match yet
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Reason for rollback
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Minimum 4 characters required"
                className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-[13px] text-text focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none"
              />
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-900/50 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="rounded-lg px-4 py-2 text-[13px] font-semibold text-text-muted hover:text-text hover:bg-surface-muted/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold shadow-sm px-4 py-2 text-[13px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Rolling back…" : `Rollback to v${targetVersion}`}
              </button>
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
