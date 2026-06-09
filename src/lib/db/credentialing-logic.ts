// EMR-627 / EMR-629 — pure credential expiration + re-credentialing logic.
//
// No Prisma / server-only import: unit-testable and reusable by the
// credential-check cron. DB accessors live in ./credentialing.ts.

const DAY_MS = 86_400_000;

export type ExpirationState = "ok" | "expiring_soon" | "expired" | "unknown";

export interface ExpirationClassification {
  state: ExpirationState;
  /** Whole days until expiry (negative if already expired); null when unknown. */
  daysUntil: number | null;
}

/** Days from `now` to `at`, rounded up (so "today" reads as 0, not -0.x). */
function daysBetween(at: Date, now: Date): number {
  return Math.ceil((at.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Classify a single expiration date relative to `now`.
 *   - no date            → "unknown"
 *   - already past        → "expired"
 *   - within `windowDays` → "expiring_soon"
 *   - else                → "ok"
 */
export function classifyExpiration(
  expiresAt: Date | null | undefined,
  now: Date,
  windowDays = 60,
): ExpirationClassification {
  if (!expiresAt) return { state: "unknown", daysUntil: null };
  const days = daysBetween(expiresAt, now);
  if (days < 0) return { state: "expired", daysUntil: days };
  if (days <= windowDays) return { state: "expiring_soon", daysUntil: days };
  return { state: "ok", daysUntil: days };
}

/** Is the provider within `windowDays` of (or past) their re-credentialing date? */
export function isRecredentialDue(
  nextRecredentialAt: Date | null | undefined,
  now: Date,
  windowDays = 90,
): boolean {
  if (!nextRecredentialAt) return false;
  return daysBetween(nextRecredentialAt, now) <= windowDays;
}

export interface CredentialLike {
  deaExpiresAt?: Date | null;
  licenseExpiresAt?: Date | null;
  malpracticeExpiresAt?: Date | null;
  boardCertExpiresAt?: Date | null;
  nextRecredentialAt?: Date | null;
}

export type CredentialAlertType =
  | "dea"
  | "license"
  | "malpractice"
  | "board_cert"
  | "recredential";

export interface CredentialAlert {
  type: CredentialAlertType;
  /** "expired" / "expiring_soon" for documents; "due" for re-credentialing. */
  state: "expired" | "expiring_soon" | "due";
  at: Date;
  daysUntil: number;
}

const DOCUMENT_FIELDS: ReadonlyArray<{
  type: Exclude<CredentialAlertType, "recredential">;
  key: keyof CredentialLike;
}> = [
  { type: "dea", key: "deaExpiresAt" },
  { type: "license", key: "licenseExpiresAt" },
  { type: "malpractice", key: "malpracticeExpiresAt" },
  { type: "board_cert", key: "boardCertExpiresAt" },
];

/**
 * Collect every actionable expiration alert for a credential profile: any
 * document that is expired or expiring within `windowDays`, plus a
 * re-credentialing alert when the cycle is due within `recredentialWindowDays`.
 * Returns an empty array when nothing needs attention.
 */
export function collectCredentialAlerts(
  cred: CredentialLike,
  now: Date,
  windowDays = 60,
  recredentialWindowDays = 90,
): CredentialAlert[] {
  const alerts: CredentialAlert[] = [];

  for (const { type, key } of DOCUMENT_FIELDS) {
    const at = cred[key] as Date | null | undefined;
    if (!at) continue;
    const cls = classifyExpiration(at, now, windowDays);
    if (cls.state === "expired" || cls.state === "expiring_soon") {
      alerts.push({ type, state: cls.state, at, daysUntil: cls.daysUntil ?? 0 });
    }
  }

  if (cred.nextRecredentialAt && isRecredentialDue(cred.nextRecredentialAt, now, recredentialWindowDays)) {
    alerts.push({
      type: "recredential",
      state: "due",
      at: cred.nextRecredentialAt,
      daysUntil: daysBetween(cred.nextRecredentialAt, now),
    });
  }

  return alerts;
}
