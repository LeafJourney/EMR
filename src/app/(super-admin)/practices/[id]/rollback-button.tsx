// EMR-748 — One-click rollback button (client).
//
// Rendered next to each non-current entry on the History tab. Opens a
// confirmation modal that requires the operator to (a) type the
// practice name verbatim and (b) provide a reason. On submit, calls the
// `rollbackPracticeConfig` server action.

"use client";

import { useState, useTransition } from "react";
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-text-muted hover:text-text underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
      >
        Rollback to v{targetVersion}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="rollback-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface shadow-2xl border border-border p-5">
            <h2
              id="rollback-title"
              className="font-display text-lg text-text tracking-tight"
            >
              Rollback to v{targetVersion}?
            </h2>
            <p className="text-[12px] text-text-muted mt-2 leading-relaxed">
              This creates a new draft snapshot from v{targetVersion} and
              records a <code>controller.config.rollback</code> audit row.
              To proceed, type the practice name verbatim and provide a
              reason.
            </p>

            <label className="block mt-4 text-[11px] uppercase tracking-wider text-text-muted">
              Practice name
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={practiceName}
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
            {confirmName && !nameMatches && (
              <div className="text-[11px] text-red-600 mt-1">
                Name does not match.
              </div>
            )}

            <label className="block mt-3 text-[11px] uppercase tracking-wider text-text-muted">
              Reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why are you rolling back?"
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-[13px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>

            {error && (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="rounded-md px-3 py-1.5 text-[13px] text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="rounded-md bg-accent px-3 py-1.5 text-[13px] text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Rolling back…" : `Rollback to v${targetVersion}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
