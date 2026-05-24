"use client";

// EMR-727 — Emergency revoke confirmation dialog
// -----------------------------------------------------------------------------
//
// Client-only modal that fronts POST
// /api/admin/super-admins/[userId]/emergency-revoke. The server-side route
// (src/app/api/admin/super-admins/[userId]/emergency-revoke/route.ts) is the
// single source of truth — this dialog is purely a friction barrier so the
// operator cannot mis-fire "burn it down" by accident:
//
//   1. A red warning banner spells out the blast radius (kills every active
//      session for the target within ~1s, fleet-wide, no undo).
//   2. The destructive button stays disabled until the operator types the
//      target's email verbatim (case-insensitive trim, matching the server
//      re-check at route.ts L102-L112).
//   3. The destructive button also requires a reason ≥10 characters (server
//      requires ≥1, but we ask the UI for a meaningful note since this row
//      goes into the audit log + Slack alert).
//
// On a 200 response we call `router.refresh()` so the parent server
// component re-fetches the super-admin list and the row drops out without
// needing a separate `onRevoked` callback. The caller can still pass
// `onSuccess` for extra cleanup (e.g. closing the parent picker).
//
// Why a separate file (not inlined in super-admin-console.tsx):
//   - keeps the destructive-action UI testable in isolation;
//   - lets the pure validation predicate `canSubmitEmergencyRevoke` be
//     unit-tested without standing up a DOM.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * Pure validation predicate — exported so the unit test can exercise the
 * "blocks submit until …" matrix without a DOM. The component below uses
 * the exact same function so the test cannot diverge from the UI.
 *
 * Rules:
 *   - reason must be ≥10 characters after trim (and ≤500, matching the
 *     server zod schema at route.ts L45).
 *   - confirmEmail must equal targetEmail after trim + toLowerCase (the
 *     server does the same comparison at route.ts L102-L104).
 *   - submitting === true short-circuits to false so the user can't
 *     double-fire while a request is in flight.
 */
export function canSubmitEmergencyRevoke(args: {
  targetEmail: string;
  confirmEmail: string;
  reason: string;
  submitting: boolean;
}): boolean {
  if (args.submitting) return false;
  const trimmedReason = args.reason.trim();
  if (trimmedReason.length < 10) return false;
  if (trimmedReason.length > 500) return false;
  const a = args.confirmEmail.trim().toLowerCase();
  const b = args.targetEmail.trim().toLowerCase();
  if (a.length === 0) return false;
  return a === b;
}

export interface EmergencyRevokeDialogProps {
  /** The user whose super-admin role + sessions will be terminated. */
  targetUserId: string;
  /** Target's email — operator must re-type this to enable submit. */
  targetEmail: string;
  /** Called when the operator dismisses the dialog (Cancel / Esc / backdrop). */
  onCancel: () => void;
  /**
   * Optional success hook fired AFTER router.refresh() kicks off. The
   * dialog already invalidates server state on its own — use this if the
   * caller needs to clear local UI (e.g. unset its "selected target").
   */
  onSuccess?: () => void;
}

export function EmergencyRevokeDialog({
  targetUserId,
  targetEmail,
  onCancel,
  onSuccess,
}: EmergencyRevokeDialogProps) {
  const router = useRouter();
  const [confirmEmail, setConfirmEmail] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [submitState, setSubmitState] = React.useState<
    "idle" | "submitting" | "error"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [responseStatus, setResponseStatus] = React.useState<number | null>(
    null,
  );

  const canSubmit = canSubmitEmergencyRevoke({
    targetEmail,
    confirmEmail,
    reason,
    submitting: submitState === "submitting",
  });

  // Esc / X / backdrop close are now handled by the canonical Dialog
  // primitive. We block close mid-flight via the `onOpenChange` callback so
  // a half-submitted revoke can't be torn down by an accidental Esc.

  async function submit() {
    if (!canSubmit) return;
    setSubmitState("submitting");
    setError(null);
    setResponseStatus(null);
    try {
      const res = await fetch(
        `/api/admin/super-admins/${encodeURIComponent(targetUserId)}/emergency-revoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reason.trim(),
            confirmEmail: confirmEmail.trim(),
          }),
        },
      );
      setResponseStatus(res.status);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.message || data?.error || `HTTP ${res.status}`,
        );
      }
      // Invalidate server-rendered state (the super-admin list lives in
      // SuperAdminConsole's AdminsTab, which re-fetches on mount via
      // useEffect — router.refresh() forces any parent server tree to
      // re-render so cached lists drop the revoked row).
      router.refresh();
      onSuccess?.();
      onCancel();
    } catch (e: unknown) {
      setSubmitState("error");
      setError(e instanceof Error ? e.message : "Failed to emergency-revoke");
    }
  }

  const reasonTrimmed = reason.trim().length;
  const reasonTooShort = reasonTrimmed > 0 && reasonTrimmed < 10;
  // EMR-642 — guard against accidental backdrop/Esc dismissal once the
  // operator has started typing the reason or the confirmation email.
  const isDirty = confirmEmail.length > 0 || reason.length > 0;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (next) return;
        if (submitState === "submitting") return;
        onCancel();
      }}
      confirmCloseOnDirty
      isDirty={isDirty}
    >
      <DialogContent
        className="max-w-md border-danger/40"
        aria-label="Emergency revoke super-admin"
      >
        <h3 className="text-lg font-semibold text-danger">Emergency revoke</h3>

        {/* Red warning banner — the load-bearing piece of friction. */}
        <div
          role="alert"
          className="mt-3 rounded-lg border border-danger/40 bg-red-50 p-3 text-sm text-danger"
        >
          This kills every active session for this admin within 1 second across
          every replica. You cannot undo it.
        </div>

        <p className="mt-3 text-sm text-text">
          Target: <span className="font-medium">{targetEmail}</span>
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Use this only if the account is compromised. Routine departures should
          use the regular &ldquo;Revoke&rdquo; button.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="emergency-revoke-reason"
              className="block text-xs font-medium uppercase tracking-wide text-text-muted"
            >
              Reason (required, ≥10 chars — logged to audit trail)
            </label>
            <textarea
              id="emergency-revoke-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Compromised at 14:02 PT, see #incident-413"
              aria-label="Revocation reason"
              aria-invalid={reasonTooShort || undefined}
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:border-danger focus:ring-2 focus:ring-danger/20"
            />
            <p className="mt-1 text-xs text-text-muted">
              {reasonTrimmed}/500{" "}
              {reasonTooShort && (
                <span className="text-danger">
                  &middot; need {10 - reasonTrimmed} more characters
                </span>
              )}
            </p>
          </div>

          <div>
            <label
              htmlFor="emergency-revoke-confirm-email"
              className="block text-xs font-medium uppercase tracking-wide text-text-muted"
            >
              Type{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5">
                {targetEmail}
              </code>{" "}
              to confirm
            </label>
            <Input
              id="emergency-revoke-confirm-email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={targetEmail}
              aria-label="Confirm target email"
              autoComplete="off"
              spellCheck={false}
              className="mt-1"
            />
          </div>
        </div>

        {submitState === "error" && error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-danger/30 bg-red-50 p-2 text-sm text-danger"
          >
            {responseStatus ? `[${responseStatus}] ` : ""}
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={submitState === "submitting"}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!canSubmit}
            onClick={submit}
            aria-disabled={!canSubmit}
          >
            {submitState === "submitting" ? "Revoking…" : "Emergency revoke"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
