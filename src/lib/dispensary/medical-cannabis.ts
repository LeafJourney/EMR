// EMR-091 — Medical Cannabis Dispensary Module — pure business rules.
//
// Medicinal-only flow. This module collects the deterministic checks
// that gate every Rx/dispense:
//
//   - MedicalCannabisCard must be active and not expired
//   - Rx state machine transitions are restricted
//   - Dispense quantity cannot exceed Rx quantity * (1 + refills)
//   - Budtender signature is mandatory on every dispense
//   - The CURES/PDMP flag aggregator drops "no_findings" when other
//     flags are present so the UI surfaces only the real signals
//
// All rules here are pure — see medical-cannabis.test.ts.

export type CardStatus = "active" | "expired" | "revoked" | "pending";

export type RxStatus =
  | "draft"
  | "sent_to_dispensary"
  | "approved_by_dispensary"
  | "rejected_by_dispensary"
  | "partially_dispensed"
  | "fully_dispensed"
  | "cancelled"
  | "expired";

export type PdmpFlag =
  | "conflicting_scripts"
  | "early_refill"
  | "multiple_prescribers"
  | "multiple_pharmacies"
  | "controlled_substance_combo"
  | "no_findings";

// --------------------------------------------------------------
// Medical cannabis card eligibility
// --------------------------------------------------------------

export interface CardEligibilityInput {
  status: CardStatus;
  expiresOn: Date;
  /** Optional — defaults to "now". Pass a fixed clock in tests. */
  now?: Date;
}

export type CardEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

/**
 * Returns whether a patient's MMJ card is currently valid for cannabis
 * dispensing. Recreational flow is NEVER allowed — the absence of a
 * card returns ineligible.
 */
export function checkCardEligibility(input: CardEligibilityInput): CardEligibility {
  const now = input.now ?? new Date();
  if (input.status === "revoked") {
    return { eligible: false, reason: "This medical cannabis card has been revoked." };
  }
  if (input.status === "pending") {
    return {
      eligible: false,
      reason: "This medical cannabis card is pending verification.",
    };
  }
  if (input.status === "expired") {
    return { eligible: false, reason: "This medical cannabis card has expired." };
  }
  if (input.expiresOn.getTime() < now.getTime()) {
    return {
      eligible: false,
      reason: `This medical cannabis card expired on ${input.expiresOn.toISOString().slice(0, 10)}.`,
    };
  }
  return { eligible: true };
}

// --------------------------------------------------------------
// Rx state machine
// --------------------------------------------------------------

const ALLOWED_RX_TRANSITIONS: Record<RxStatus, RxStatus[]> = {
  draft: ["sent_to_dispensary", "cancelled"],
  sent_to_dispensary: [
    "approved_by_dispensary",
    "rejected_by_dispensary",
    "cancelled",
    "expired",
  ],
  approved_by_dispensary: [
    "partially_dispensed",
    "fully_dispensed",
    "cancelled",
    "expired",
  ],
  partially_dispensed: ["fully_dispensed", "cancelled", "expired"],
  fully_dispensed: [],
  rejected_by_dispensary: [],
  cancelled: [],
  expired: [],
};

export function canTransitionRx(
  from: RxStatus,
  to: RxStatus,
): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: "Already in that status." };
  const allowed = ALLOWED_RX_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `Rx cannot move from ${from} to ${to}.`,
    };
  }
  return { ok: true };
}

// --------------------------------------------------------------
// Dispense quantity bounds
// --------------------------------------------------------------

export interface DispenseBoundsInput {
  rxQuantity: number;
  rxRefills: number;
  alreadyDispensedQuantity: number;
  requestedQuantity: number;
}

export type DispenseBoundsResult =
  | { ok: true; remainingAfter: number; isFinalFill: boolean }
  | { ok: false; reason: string };

/**
 * Enforces that a single dispense cannot exceed the remaining
 * authorized quantity on the Rx. Total allowance = quantity *
 * (1 + refills). Returns whether the new dispense empties the Rx
 * (caller transitions the Rx to "fully_dispensed").
 */
export function checkDispenseBounds(input: DispenseBoundsInput): DispenseBoundsResult {
  if (input.requestedQuantity <= 0) {
    return { ok: false, reason: "Quantity must be greater than zero." };
  }
  const totalAllowed = input.rxQuantity * (1 + input.rxRefills);
  const remaining = totalAllowed - input.alreadyDispensedQuantity;
  if (remaining <= 0) {
    return { ok: false, reason: "All authorized fills have already been dispensed." };
  }
  if (input.requestedQuantity > remaining) {
    return {
      ok: false,
      reason: `Only ${remaining} unit(s) of the Rx remain authorized; requested ${input.requestedQuantity}.`,
    };
  }
  const remainingAfter = remaining - input.requestedQuantity;
  return { ok: true, remainingAfter, isFinalFill: remainingAfter === 0 };
}

// --------------------------------------------------------------
// Budtender signature validation
// --------------------------------------------------------------

export interface BudtenderSignatureInput {
  budtenderName: string;
  budtenderSignature: string;
}

export function validateBudtenderSignature(
  input: BudtenderSignatureInput,
): { ok: true } | { ok: false; reason: string } {
  if (!input.budtenderName || input.budtenderName.trim().length === 0) {
    return { ok: false, reason: "Budtender name is required on every dispense." };
  }
  const sig = input.budtenderSignature.trim();
  if (!sig) {
    return {
      ok: false,
      reason: "Budtender e-signature is required on every dispense.",
    };
  }
  // Reject obvious dummy values like "x" or "skip" so the audit row
  // has something a regulator can rely on.
  if (sig.length < 4) {
    return {
      ok: false,
      reason: "Budtender signature must be a real signature, not a placeholder.",
    };
  }
  return { ok: true };
}

// --------------------------------------------------------------
// CURES / PDMP flag aggregator
// --------------------------------------------------------------

/**
 * Normalizes flags returned from the PDMP. Drops "no_findings" when
 * any real flag is present so the UI never shows a contradiction.
 * De-duplicates and orders flags by severity for stable rendering.
 */
export function normalizePdmpFlags(raw: PdmpFlag[]): PdmpFlag[] {
  const set = new Set<PdmpFlag>(raw);
  const real = Array.from(set).filter((f) => f !== "no_findings");
  if (real.length === 0) return ["no_findings"];

  const severity: Record<PdmpFlag, number> = {
    controlled_substance_combo: 5,
    conflicting_scripts: 4,
    multiple_prescribers: 3,
    multiple_pharmacies: 2,
    early_refill: 1,
    no_findings: 0,
  };
  return real.sort((a, b) => severity[b] - severity[a]);
}

export function pdmpFlagLabel(flag: PdmpFlag): string {
  switch (flag) {
    case "conflicting_scripts":
      return "Conflicting prescriptions on file";
    case "early_refill":
      return "Early refill pattern";
    case "multiple_prescribers":
      return "Multiple prescribers";
    case "multiple_pharmacies":
      return "Multiple pharmacies";
    case "controlled_substance_combo":
      return "Risky controlled-substance combination";
    case "no_findings":
      return "No PDMP findings";
  }
}

// --------------------------------------------------------------
// Auto-populate medication payload
// --------------------------------------------------------------

export interface DispenseToMedicationInput {
  productName: string;
  productSku: string;
  quantity: number;
  unit: string;
  thcMgPerUnit?: number | null;
  cbdMgPerUnit?: number | null;
  dispensedAt: Date;
  doseInstructions?: string | null;
  prescriber?: string | null;
}

export interface MedicationFromDispense {
  name: string;
  dosage: string;
  prescriber: string | null;
  notes: string;
  type: "cannabis";
  startDate: Date;
  active: true;
}

/**
 * Builds the PatientMedication payload created when a dispense is
 * recorded. Encodes the SKU + cannabinoid breakdown in `notes` so the
 * chart timeline carries enough detail for outcome tracking without
 * needing to JOIN back to the dispense row.
 */
export function dispenseToMedication(
  input: DispenseToMedicationInput,
): MedicationFromDispense {
  const cannabinoid: string[] = [];
  if (input.thcMgPerUnit != null) cannabinoid.push(`THC ${input.thcMgPerUnit}mg/unit`);
  if (input.cbdMgPerUnit != null) cannabinoid.push(`CBD ${input.cbdMgPerUnit}mg/unit`);

  const dosage = input.doseInstructions?.trim()
    ? input.doseInstructions.trim()
    : `${input.quantity} ${input.unit}`;

  const noteLines = [
    `SKU: ${input.productSku}`,
    `Dispensed ${input.dispensedAt.toISOString().slice(0, 10)}: ${input.quantity} ${input.unit}`,
    cannabinoid.length > 0 ? cannabinoid.join(" · ") : null,
  ].filter((l): l is string => l != null);

  return {
    name: input.productName,
    dosage,
    prescriber: input.prescriber ?? null,
    notes: noteLines.join("\n"),
    type: "cannabis",
    startDate: input.dispensedAt,
    active: true,
  };
}
