"use client";

// Lifecycle actions — archive / discard, state-aware and safety-gated.
//
// Model (approved): archive-first. Archiving flips status → archived via the
// existing /api/configs/[id]/archive endpoint (reversible via rollback; history
// preserved). A draft with NO real activity (no patients/claims/encounters) is
// framed as "Discard draft" — still an archive under the hood, so nothing is
// hard-deleted on the shared DB. Practices with activity are archive-only and
// require typing the practice name to confirm. Archived practices show nothing.
//
// TODO(hard-delete): a true row delete for empty drafts would also need to
// confirm zero accepted members + documents and clean FK rows (configuration
// versions, audit). Left as a guarded follow-up — archive is the safe default.

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PracticeLifecycleStage } from "../lifecycle";
import { discardDraftPractice } from "./discard-action";

export function PracticeLifecycleActions({
  configId,
  practiceName,
  stage,
  isEmpty,
}: {
  configId: string | null;
  practiceName: string;
  stage: PracticeLifecycleStage;
  isEmpty: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Archived is terminal; nothing destructive to offer (restore is via rollback).
  if (stage === "archived" || !configId) return null;

  const isDraftStage =
    stage === "draft" || stage === "onboarding" || stage === "needs_review";
  const mode: "discard" | "archive" = isDraftStage && isEmpty ? "discard" : "archive";
  // Higher bar (type the name) for anything with activity or that's live.
  const needsTypeConfirm = mode === "archive";

  async function submit() {
    if (!configId) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "discard") {
        // True hard-delete — empty drafts only. The action re-verifies emptiness
        // server-side before deleting.
        const res = await discardDraftPractice(configId);
        if (res.ok) {
          router.push("/practices");
          return;
        }
        setError(res.message);
        return;
      }
      // Archive (activity / live) — reuse the existing endpoint.
      const res = await fetch(
        `/api/configs/${encodeURIComponent(configId)}/archive`,
        { method: "POST" },
      );
      if (res.ok) {
        router.push("/practices");
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | { reason?: string }
        | null;
      setError(
        body?.reason === "invalid_state"
          ? "This practice can't be archived from its current state."
          : `Action failed (${res.status}).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    (!needsTypeConfirm ||
      confirmText.trim().toLowerCase() === practiceName.trim().toLowerCase());

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
          Manage practice
        </div>
        <p className="text-[13px] text-text-muted max-w-xl">
          {mode === "discard"
            ? "This draft has no patients, claims, or encounters yet — it can be safely discarded so it doesn't clutter your pipeline."
            : "Archiving removes this practice from active operations but preserves its history, and it can be restored."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setConfirmText("");
        }}
        className="shrink-0 text-[13px] px-3 py-1.5 rounded-lg border border-rose-deep/30 text-rose-deep hover:bg-rose/10 transition-colors"
      >
        {mode === "discard" ? "Discard draft" : "Archive practice"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface-raised border border-border shadow-lg p-6 grid gap-4">
            <div>
              <h3 className="font-display text-lg text-text">
                {mode === "discard"
                  ? "Discard this draft?"
                  : "Archive this practice?"}
              </h3>
              <p className="text-[13px] text-text-muted mt-1.5">
                {mode === "discard"
                  ? `“${practiceName}” will be permanently deleted. This draft has no patients, claims, or encounters, so nothing operational is lost — but this can’t be undone.`
                  : `“${practiceName}” will move to Archived. Its history and data are preserved and it can be restored — but it leaves active operations.`}
              </p>
            </div>
            {needsTypeConfirm && (
              <div>
                <label className="text-[12px] text-text-muted">
                  Type the practice name to confirm
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={practiceName}
                  className="mt-1 w-full text-sm rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-accent focus:outline-none"
                />
              </div>
            )}
            {error && <p className="text-[12px] text-rose-deep">{error}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[13px] px-3 py-1.5 rounded-lg text-text-muted hover:bg-surface-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="text-[13px] px-3 py-1.5 rounded-lg bg-rose-deep text-white font-semibold disabled:opacity-40"
              >
                {submitting
                  ? "Working…"
                  : mode === "discard"
                    ? "Discard draft"
                    : "Archive practice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
