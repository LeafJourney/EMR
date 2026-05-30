// SAFE: dead-export-allowed reason="quarantined QR rescue helper awaiting route wiring"
// Canonical audit action names for the QR rescue check-in surfaces.
//
// Audit rules (security contract): record QR generation, QR view, QR
// redeem, failed/expired token attempts, and intake submissions. NEVER log raw
// tokens or free-text PHI — metadata is limited to opaque ids, the QR token
// *hash* (not the token), milestone/channel, and a failure reason enum.
//
// The pre-visit completion reminder audit action lives with the sender as
// PREVISIT_COMPLETION_REMINDER_ACTION ("previsit.completion.reminder.sent").

export const CHECK_IN_AUDIT_ACTIONS = {
  /** A QR rescue token was generated for an appointment. */
  QR_GENERATED: "checkin.qr.generated",
  /** The QR landing page was viewed (token presented, pre-identity-challenge). */
  QR_VIEWED: "checkin.qr.viewed",
  /** A QR token was successfully redeemed (identity verified, single-use spent). */
  QR_REDEEMED: "checkin.qr.redeemed",
  /** A QR redemption attempt failed (invalid/expired/mismatch/out-of-window/identity). */
  QR_REDEEM_FAILED: "checkin.qr.redeem_failed",
  /** A pre-visit intake item was submitted via the rescue path. */
  INTAKE_SUBMITTED: "checkin.intake.submitted",
} as const;

export type CheckInAuditAction =
  (typeof CHECK_IN_AUDIT_ACTIONS)[keyof typeof CHECK_IN_AUDIT_ACTIONS];
