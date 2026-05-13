// EMR-068 — Patient billing portal: statement dispute helpers.
//
// Pure-logic helpers around the StatementDispute state machine plus
// the AI plain-language drafter. The drafter is intentionally
// deterministic + template-based for this layer — the configured AI
// client is plugged in by callers that want a richer draft, but the
// fallback ships the correct shape so the patient never sees a blank
// state.

export type DisputeReason =
  | "charge_unrecognized"
  | "service_not_received"
  | "insurance_should_cover"
  | "duplicate_charge"
  | "wrong_amount"
  | "wrong_diagnosis"
  | "identity_concern"
  | "other";

export type DisputeStatus =
  | "submitted"
  | "under_review"
  | "awaiting_patient"
  | "resolved_corrected"
  | "resolved_upheld"
  | "withdrawn";

const REASON_LABELS: Record<DisputeReason, string> = {
  charge_unrecognized: "I don't recognize this charge",
  service_not_received: "I never received this service",
  insurance_should_cover: "My insurance should have covered this",
  duplicate_charge: "This looks like a duplicate charge",
  wrong_amount: "The amount looks wrong",
  wrong_diagnosis: "The diagnosis on this bill looks wrong",
  identity_concern: "I think this isn't actually my charge",
  other: "Something else",
};

export function reasonLabel(reason: DisputeReason): string {
  return REASON_LABELS[reason];
}

export function listReasonOptions(): { value: DisputeReason; label: string }[] {
  return (Object.keys(REASON_LABELS) as DisputeReason[]).map((value) => ({
    value,
    label: REASON_LABELS[value],
  }));
}

// --------------------------------------------------------------
// State machine
// --------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  submitted: ["under_review", "withdrawn"],
  under_review: [
    "awaiting_patient",
    "resolved_corrected",
    "resolved_upheld",
    "withdrawn",
  ],
  awaiting_patient: [
    "under_review",
    "resolved_corrected",
    "resolved_upheld",
    "withdrawn",
  ],
  resolved_corrected: [],
  resolved_upheld: [],
  withdrawn: [],
};

export function canTransition(
  from: DisputeStatus,
  to: DisputeStatus,
): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: "Already in that status." };
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `Cannot move from ${from} to ${to}.`,
    };
  }
  return { ok: true };
}

export function isTerminal(status: DisputeStatus): boolean {
  return (
    status === "resolved_corrected" ||
    status === "resolved_upheld" ||
    status === "withdrawn"
  );
}

// --------------------------------------------------------------
// Patient-facing plain-language status copy
// --------------------------------------------------------------

const STATUS_LABEL: Record<DisputeStatus, string> = {
  submitted: "We got your dispute and the billing team will pick it up shortly.",
  under_review: "Our billing team is looking into this — usually 3–5 business days.",
  awaiting_patient: "We need a quick reply from you to keep this moving.",
  resolved_corrected: "Resolved — we adjusted the bill.",
  resolved_upheld: "Resolved — after review the charge was correct.",
  withdrawn: "You withdrew this dispute.",
};

export function patientStatusCopy(status: DisputeStatus): string {
  return STATUS_LABEL[status];
}

// --------------------------------------------------------------
// AI draft resolution — template-based fallback
// --------------------------------------------------------------

export interface DisputeDraftInput {
  reason: DisputeReason;
  patientNarrative: string;
  statement: {
    statementNumber: string;
    totalChargesCents: number;
    insurancePaidCents: number;
    amountDueCents: number;
    /** Optional — surfacing CPT codes helps the drafter cite specifics */
    lineItems?: { description: string; amountCents: number; cptCode?: string }[];
  };
  disputedAmountCents?: number | null;
}

/**
 * Generates a plain-language summary of the dispute that a billing
 * agent can review and ship. Deliberately template-based — when an AI
 * client is wired in, it should call this for the fallback path.
 */
export function draftAiResolution(input: DisputeDraftInput): string {
  const { reason, statement, disputedAmountCents } = input;
  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
  const lineSummary = (statement.lineItems ?? [])
    .slice(0, 3)
    .map((l) => `- ${l.description}${l.cptCode ? ` (CPT ${l.cptCode})` : ""}: ${fmt(l.amountCents)}`)
    .join("\n");

  const disputed = disputedAmountCents != null ? fmt(disputedAmountCents) : null;

  const opener = `Statement ${statement.statementNumber} totals ${fmt(statement.totalChargesCents)}; insurance covered ${fmt(statement.insurancePaidCents)}; patient portion is ${fmt(statement.amountDueCents)}.`;

  const reasonBlock: Record<DisputeReason, string> = {
    charge_unrecognized: `Patient does not recognize one or more charges${disputed ? ` totalling ${disputed}` : ""}. Recommended next step: have the billing team confirm the encounter date and procedure with the patient and the EHR audit log.`,
    service_not_received: `Patient states the service was never received${disputed ? ` (${disputed})` : ""}. Recommended: review encounter notes and arrival logs; if no record of service, issue a corrected statement.`,
    insurance_should_cover: `Patient believes insurance should have covered ${disputed ?? "the disputed portion"}. Recommended: confirm the latest EOB, eligibility check on the service date, and that the correct payer was billed.`,
    duplicate_charge: `Patient suspects a duplicate of an earlier charge. Recommended: pull all claim rows tied to the encounter date and compare against the statement.`,
    wrong_amount: `Patient believes the amount is incorrect${disputed ? ` (asserts ${disputed} is wrong)` : ""}. Recommended: verify allowable from the payer contract and any adjustments already posted.`,
    wrong_diagnosis: `Patient believes the diagnosis on the bill is wrong, which may have driven a coverage decision. Recommended: re-review the provider's note and the diagnosis selection on the claim.`,
    identity_concern: `Patient indicates the charge may not be theirs. Recommended: PHI/identity check before any further action — this is a P0 escalation if confirmed.`,
    other: `See patient narrative for details. Recommended: assign to the billing team for triage.`,
  };

  return [opener, lineSummary, "", reasonBlock[reason]].filter(Boolean).join("\n");
}

// --------------------------------------------------------------
// Lab stoplight — used inline on patient billing for any encounters
// whose service date has a lab on file. Mirrors the drug-interaction
// stoplight pattern.
// --------------------------------------------------------------

export type LabStoplight = "green" | "yellow" | "red";

export interface LabMarkerForStoplight {
  value: number;
  refLow?: number | null;
  refHigh?: number | null;
  /** Optional explicit critical thresholds — overrides refLow/refHigh distance heuristic. */
  criticalLow?: number | null;
  criticalHigh?: number | null;
}

/**
 * Map a lab marker value to a stoplight color. The rule set is:
 *  - "red" if outside the explicit critical threshold (CMS-defined)
 *    OR outside the reference range by >25% — i.e. severely abnormal.
 *  - "yellow" if outside the reference range but not severely so.
 *  - "green" otherwise.
 *
 * Returning a discrete bucket keeps the patient-facing UI honest
 * (green/yellow/red, no in-between).
 */
export function classifyMarker(marker: LabMarkerForStoplight): LabStoplight {
  const { value } = marker;
  if (marker.criticalLow != null && value <= marker.criticalLow) return "red";
  if (marker.criticalHigh != null && value >= marker.criticalHigh) return "red";

  const low = marker.refLow ?? null;
  const high = marker.refHigh ?? null;

  if (low == null && high == null) return "green";

  // Below or above the reference range
  if (low != null && value < low) {
    const drift = (low - value) / Math.max(Math.abs(low), 1);
    return drift > 0.25 ? "red" : "yellow";
  }
  if (high != null && value > high) {
    const drift = (value - high) / Math.max(Math.abs(high), 1);
    return drift > 0.25 ? "red" : "yellow";
  }
  return "green";
}

export interface LabPanelForStoplight {
  panelName: string;
  markers: Record<string, LabMarkerForStoplight>;
}

export interface PanelStoplight {
  panelName: string;
  worstMarker: LabStoplight;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  /** Top abnormal markers — useful for the AI suggestion bubble. */
  abnormalMarkers: { name: string; value: number; band: LabStoplight }[];
}

export function classifyPanel(panel: LabPanelForStoplight): PanelStoplight {
  let red = 0;
  let yellow = 0;
  let green = 0;
  const abnormal: PanelStoplight["abnormalMarkers"] = [];
  for (const [name, marker] of Object.entries(panel.markers)) {
    const band = classifyMarker(marker);
    if (band === "red") {
      red += 1;
      abnormal.push({ name, value: marker.value, band });
    } else if (band === "yellow") {
      yellow += 1;
      abnormal.push({ name, value: marker.value, band });
    } else {
      green += 1;
    }
  }
  return {
    panelName: panel.panelName,
    worstMarker: red > 0 ? "red" : yellow > 0 ? "yellow" : "green",
    redCount: red,
    yellowCount: yellow,
    greenCount: green,
    abnormalMarkers: abnormal,
  };
}

// --------------------------------------------------------------
// AI suggestion for abnormal labs — provider-facing recommendation
// bubble. Lives next to the stoplight on the chart.
// --------------------------------------------------------------

/**
 * Returns a short clinical-suggestion string for a labelled marker.
 * Conservative template — meant to be a *prompt* for the physician,
 * never an automated order.
 */
export function suggestForAbnormal(markerName: string, band: LabStoplight): string | null {
  if (band === "green") return null;
  const key = markerName.toLowerCase();

  if (key.includes("hba1c") || key.includes("a1c")) {
    return band === "red"
      ? "A1c is critically high. Consider intensifying glycemic plan, repeat in 3 months, screen for retinopathy/neuropathy."
      : "A1c is mildly elevated. Reinforce lifestyle, consider metformin if not already on it, repeat in 3 months.";
  }
  if (key.includes("alt") || key.includes("ast")) {
    return band === "red"
      ? "Liver enzyme markedly elevated. Pause hepatotoxic meds, repeat panel, consider hepatitis screen and imaging."
      : "Liver enzyme mildly elevated. Review medications, alcohol use; recheck in 4–6 weeks.";
  }
  if (key.includes("ldl") || key.includes("cholesterol")) {
    return band === "red"
      ? "Lipid profile severely abnormal. Reinforce diet + start/escalate statin per ACC/AHA risk score."
      : "Lipid mildly elevated. Lifestyle counselling and recheck in 3–6 months; reassess risk score.";
  }
  if (key.includes("creat") || key.includes("egfr")) {
    return band === "red"
      ? "Renal function severely abnormal. Dose-adjust renally-cleared meds, hold NSAIDs, send to nephrology if eGFR < 30."
      : "Renal function mildly off baseline. Recheck in 2–4 weeks, review medications, hydration history.";
  }
  if (key.includes("tsh") || key.includes("free t4")) {
    return band === "red"
      ? "Thyroid function severely off. Confirm with free T4 + free T3; refer to endocrine if marked."
      : "Thyroid function mildly off. Recheck TSH in 6–8 weeks; symptom review for hypo/hyperthyroid.";
  }
  return band === "red"
    ? "Marker is in the critical band. Recommend repeating the lab and discussing with the patient before next visit."
    : "Marker is outside the reference range. Recommend repeat in 4–6 weeks if asymptomatic.";
}
