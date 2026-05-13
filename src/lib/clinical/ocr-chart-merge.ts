/**
 * EMR-081 — Merge OCR-extracted fields into an existing chart.
 *
 * The raw OCR extractor returns ExtractedField rows. Before we write any
 * of them to the chart we need to know which fields would COLLIDE with
 * an existing value, which would simply ADD, and which would DUPLICATE
 * (no-op). The clinician then sees a single review screen instead of
 * one decision per field.
 *
 * Pure function — no I/O. Caller supplies a snapshot of the current
 * chart and we return a planned merge.
 */

import type { ExtractedField } from "./ocr-extract";

export interface ChartSnapshot {
  dob?: string | null;
  phone?: string | null;
  externalMrn?: string | null;
  medications?: Array<{ name: string; doseDisplay?: string | null }> | null;
  allergies?: Array<{ substance: string }> | null;
  problems?: Array<{ icd10: string }> | null;
  vitals?: {
    bp?: string | null;
    hr?: string | null;
    weight_lbs?: string | null;
    height_in?: string | null;
    temp_f?: string | null;
  } | null;
  insurance?: { payer?: string | null } | null;
}

export type MergeDecision = "add" | "duplicate" | "conflict" | "review";

export interface MergePlanItem {
  field: ExtractedField;
  decision: MergeDecision;
  /** Existing chart value the OCR field collides with (if any). */
  existingValue?: string;
  /** Short rationale shown to the clinician. */
  rationale: string;
}

export interface MergePlan {
  items: MergePlanItem[];
  /** Items the clinician should apply with one click — already deduped. */
  autoApply: MergePlanItem[];
  /** Items requiring explicit review (conflicts or low-confidence). */
  needsReview: MergePlanItem[];
  /** Items the clinician can safely ignore (already in the chart). */
  duplicates: MergePlanItem[];
}

const AUTO_APPLY_CONFIDENCE = 0.8;

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function medicationKey(value: string): string {
  // Drop dose to compare med identity. "Lisinopril 10mg" vs "Lisinopril 20mg"
  // should still be detectable as a conflict on the same medication.
  return normalize(value).split(/\s+/)[0];
}

function planFor(field: ExtractedField, chart: ChartSnapshot): MergePlanItem {
  const lowConfidence = field.confidence < AUTO_APPLY_CONFIDENCE;
  const baseReview: Pick<MergePlanItem, "decision" | "rationale"> = lowConfidence
    ? { decision: "review", rationale: "Low confidence — clinician confirmation required." }
    : { decision: "add", rationale: "New value; no existing chart entry." };

  switch (field.path) {
    case "dob": {
      const existing = chart.dob;
      if (!existing) return { field, ...baseReview };
      if (normalize(existing) === normalize(field.value)) {
        return { field, decision: "duplicate", existingValue: existing, rationale: "Chart already records the same DOB." };
      }
      return {
        field,
        decision: "conflict",
        existingValue: existing,
        rationale: "DOB on chart differs from the OCR'd document.",
      };
    }
    case "phone": {
      const existing = chart.phone;
      if (!existing) return { field, ...baseReview };
      if (normalize(existing) === normalize(field.value)) {
        return { field, decision: "duplicate", existingValue: existing, rationale: "Chart already has this phone number." };
      }
      return {
        field,
        decision: "conflict",
        existingValue: existing,
        rationale: "Phone on file differs from the OCR'd document.",
      };
    }
    case "externalMrn": {
      const existing = chart.externalMrn;
      if (!existing) return { field, ...baseReview };
      if (normalize(existing) === normalize(field.value)) {
        return { field, decision: "duplicate", existingValue: existing, rationale: "External MRN already linked." };
      }
      return {
        field,
        decision: "conflict",
        existingValue: existing,
        rationale: "An external MRN is already linked — adding another requires review.",
      };
    }
    case "vital.bp":
    case "vital.hr":
    case "vital.weight_lbs":
    case "vital.height_in":
    case "vital.temp_f": {
      // Vitals are time-series — every measurement is a new row, never
      // a conflict. We only mark them "duplicate" if the latest known
      // value matches verbatim.
      const key = field.path.split(".")[1] as keyof NonNullable<ChartSnapshot["vitals"]>;
      const existing = chart.vitals?.[key] ?? null;
      if (existing && normalize(existing) === normalize(field.value)) {
        return { field, decision: "duplicate", existingValue: existing, rationale: "Latest recorded vital equals the OCR value." };
      }
      return { field, ...baseReview };
    }
    case "medication": {
      const key = medicationKey(field.value);
      const match = (chart.medications ?? []).find(
        (m) => medicationKey(m.name) === key,
      );
      if (!match) return { field, ...baseReview };
      const matchDisplay = `${match.name}${match.doseDisplay ? ` ${match.doseDisplay}` : ""}`;
      if (normalize(matchDisplay) === normalize(field.value)) {
        return { field, decision: "duplicate", existingValue: matchDisplay, rationale: "Same medication + dose already on the med list." };
      }
      return {
        field,
        decision: "conflict",
        existingValue: matchDisplay,
        rationale: "Medication is on the list with a different dose — confirm which is current.",
      };
    }
    case "allergy": {
      const existing = (chart.allergies ?? []).find(
        (a) => normalize(a.substance) === normalize(field.value),
      );
      if (existing) {
        return { field, decision: "duplicate", existingValue: existing.substance, rationale: "Allergy already on the chart." };
      }
      return { field, ...baseReview };
    }
    case "problem.icd10": {
      const existing = (chart.problems ?? []).find(
        (p) => normalize(p.icd10) === normalize(field.value),
      );
      if (existing) {
        return { field, decision: "duplicate", existingValue: existing.icd10, rationale: "Problem already on the active list." };
      }
      return { field, ...baseReview };
    }
    case "insurance.payer": {
      const existing = chart.insurance?.payer;
      if (!existing) return { field, ...baseReview };
      if (normalize(existing) === normalize(field.value)) {
        return { field, decision: "duplicate", existingValue: existing, rationale: "Payer already on file." };
      }
      return {
        field,
        decision: "conflict",
        existingValue: existing,
        rationale: "Payer differs from the chart — confirm the active plan.",
      };
    }
    default:
      return { field, ...baseReview };
  }
}

export function planMerge(
  fields: ExtractedField[],
  chart: ChartSnapshot,
): MergePlan {
  const items = fields.map((f) => planFor(f, chart));
  const autoApply = items.filter((i) => i.decision === "add");
  const needsReview = items.filter(
    (i) => i.decision === "conflict" || i.decision === "review",
  );
  const duplicates = items.filter((i) => i.decision === "duplicate");
  return { items, autoApply, needsReview, duplicates };
}
