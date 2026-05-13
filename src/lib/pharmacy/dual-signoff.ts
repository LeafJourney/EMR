// EMR-063 — Pharmacy Communication Module: Dual Sign-Off State Machine
//
// Every medication change that flows out of a pharmacy thread is a
// `MedicationChangeRequest`. The change CANNOT be applied to the
// patient's chart until BOTH parties (pharmacist + provider) have
// approved it. A rejection from either side terminally rejects the
// request.
//
// The state machine here is pure — it takes the current set of
// signoffs and returns the next status. The Prisma layer is a thin
// wrapper that persists the row and writes an AuditLog entry on
// terminal transitions.
//
// Decoupling the state machine from Prisma lets us unit-test every
// branch without DB plumbing. See dual-signoff.test.ts.

export type SignoffParty = "pharmacist" | "provider";
export type SignoffDecision = "approve" | "reject";

export type ChangeStatus =
  | "proposed"
  | "pharmacist_signed"
  | "provider_signed"
  | "fully_signed"
  | "applied"
  | "rejected"
  | "withdrawn";

export interface Signoff {
  party: SignoffParty;
  decision: SignoffDecision;
  signedById: string;
  signedName: string;
  npi?: string;
  comments?: string;
  signedAt: Date;
}

export interface ChangeRequestState {
  status: ChangeStatus;
  signoffs: Signoff[];
  appliedAt: Date | null;
}

// --------------------------------------------------------------
// Pure state transitions
// --------------------------------------------------------------

/**
 * Compute the status implied by the current set of signoffs.
 *
 * Rules:
 *  - 0 signoffs → "proposed"
 *  - Any reject → "rejected" (terminal until withdrawn + re-proposed)
 *  - 1 approve from pharmacist → "pharmacist_signed"
 *  - 1 approve from provider → "provider_signed"
 *  - Both approve → "fully_signed"
 *
 * "applied" and "withdrawn" are terminal lifecycle states set by the
 * caller — they are never produced from signoff inspection alone.
 */
export function computeStatus(signoffs: readonly Signoff[]): ChangeStatus {
  if (signoffs.some((s) => s.decision === "reject")) return "rejected";

  const approvals = signoffs.filter((s) => s.decision === "approve");
  const haveProvider = approvals.some((s) => s.party === "provider");
  const havePharmacist = approvals.some((s) => s.party === "pharmacist");

  if (haveProvider && havePharmacist) return "fully_signed";
  if (haveProvider) return "provider_signed";
  if (havePharmacist) return "pharmacist_signed";
  return "proposed";
}

/**
 * Returns true if this signoff would be a duplicate or conflicting
 * signature on the request. The Prisma layer also enforces this with
 * a unique constraint on (requestId, party); the pure function gives
 * the UI a fast pre-flight check.
 */
export function canSign(
  existingSignoffs: readonly Signoff[],
  party: SignoffParty,
): { ok: true } | { ok: false; reason: string } {
  if (existingSignoffs.some((s) => s.party === party)) {
    return {
      ok: false,
      reason: `This change has already been signed by the ${party}.`,
    };
  }
  return { ok: true };
}

/**
 * Returns true if the change is in a state where applying it would be
 * legal. Only fully-signed (both parties approved) and not-yet-applied
 * requests can be applied. Rejected, withdrawn, and already-applied
 * requests cannot.
 */
export function canApply(state: ChangeRequestState): boolean {
  return state.status === "fully_signed" && state.appliedAt == null;
}

/**
 * Append a new signoff and return the new status. Caller is
 * responsible for persisting both the signoff row and the status
 * update inside a single transaction.
 *
 * Throws if the party has already signed.
 */
export function addSignoff(
  state: ChangeRequestState,
  signoff: Signoff,
): { nextStatus: ChangeStatus; signoffs: Signoff[] } {
  if (state.status === "applied") {
    throw new Error("Cannot sign a change request that has already been applied.");
  }
  if (state.status === "withdrawn") {
    throw new Error("Cannot sign a change request that has been withdrawn.");
  }
  if (state.status === "rejected") {
    throw new Error("Cannot sign a change request that has been rejected.");
  }
  const check = canSign(state.signoffs, signoff.party);
  if (!check.ok) throw new Error(check.reason);

  const signoffs = [...state.signoffs, signoff];
  return {
    nextStatus: computeStatus(signoffs),
    signoffs,
  };
}

// --------------------------------------------------------------
// Plain-language status summaries — used in patient chart timeline
// --------------------------------------------------------------

const STATUS_LABEL: Record<ChangeStatus, string> = {
  proposed: "Proposed — waiting on pharmacist + provider review",
  pharmacist_signed: "Pharmacist approved — waiting on provider",
  provider_signed: "Provider approved — waiting on pharmacist",
  fully_signed: "Both approved — ready to apply",
  applied: "Applied to the patient's chart",
  rejected: "Rejected — change will not be applied",
  withdrawn: "Withdrawn before sign-off completed",
};

export function statusLabel(status: ChangeStatus): string {
  return STATUS_LABEL[status];
}

// --------------------------------------------------------------
// Medication "after" payload — what gets written to PatientMedication
// when a fully-signed change is applied. Decoupled from the Prisma
// type so we can validate the JSON blob defensively.
// --------------------------------------------------------------

export interface MedicationAfter {
  /** Active flag — set to false on a "discontinue" kind. */
  active: boolean;
  name: string;
  genericName?: string;
  dosage?: string;
  prescriber?: string;
  notes?: string;
  /** Discontinue reason — surfaced in chart timeline. */
  discontinuedReason?: string;
}

export function validateAfterPayload(raw: unknown): MedicationAfter {
  if (!raw || typeof raw !== "object") {
    throw new Error("afterJson must be an object describing the post-change medication state.");
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.name !== "string" || rec.name.trim().length === 0) {
    throw new Error("afterJson.name is required and must be a non-empty string.");
  }
  if (typeof rec.active !== "boolean") {
    throw new Error("afterJson.active must be a boolean.");
  }
  return {
    active: rec.active,
    name: rec.name,
    genericName:
      typeof rec.genericName === "string" ? rec.genericName : undefined,
    dosage: typeof rec.dosage === "string" ? rec.dosage : undefined,
    prescriber: typeof rec.prescriber === "string" ? rec.prescriber : undefined,
    notes: typeof rec.notes === "string" ? rec.notes : undefined,
    discontinuedReason:
      typeof rec.discontinuedReason === "string"
        ? rec.discontinuedReason
        : undefined,
  };
}
