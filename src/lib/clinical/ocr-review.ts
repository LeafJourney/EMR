/**
 * EMR-081 — OCR scan & auto-populate: review view-model.
 *
 * Composes the two pure engines —
 *   - `ocr-extract`     (raw text  → structured ExtractedField[])
 *   - `ocr-chart-merge` (fields    → collision-aware MergePlan)
 * — into a single object the "Scan & auto-populate" review screen can
 * render directly. Keeping the composition here (instead of in the
 * client component) gives the orchestration its own test seam and keeps
 * the UI a thin presentation layer.
 *
 * Pure — no I/O. The OCR itself (Vision API, Tesseract, …) happens
 * upstream; we receive the recognized text.
 */

import {
  extractFromOcr,
  toChartPatch,
  type OcrExtractInput,
  type ExtractedFieldKind,
} from "./ocr-extract";
import {
  planMerge,
  type ChartSnapshot,
  type MergePlanItem,
} from "./ocr-chart-merge";

export interface KindCount {
  kind: ExtractedFieldKind;
  count: number;
}

export interface OcrReview {
  /** Total structured fields the extractor pulled out. */
  fieldsFound: number;
  /** New values with no chart collision — one-click apply. */
  autoApply: MergePlanItem[];
  /** Conflicts or low-confidence values needing clinician confirmation. */
  needsReview: MergePlanItem[];
  /** Values already present in the chart — safe to ignore. */
  duplicates: MergePlanItem[];
  /** Counts grouped by field kind, in first-seen order. */
  byKind: KindCount[];
  /** Verbatim text the extractor could not classify, ready for the note. */
  noteAddendum: string;
  residual: string;
}

export function buildOcrReview(
  input: OcrExtractInput,
  chart: ChartSnapshot,
): OcrReview {
  const extraction = extractFromOcr(input);
  const plan = planMerge(extraction.fields, chart);
  const patch = toChartPatch(extraction);

  const order: ExtractedFieldKind[] = [];
  const counts = new Map<ExtractedFieldKind, number>();
  for (const f of extraction.fields) {
    if (!counts.has(f.kind)) order.push(f.kind);
    counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  }

  return {
    fieldsFound: extraction.fields.length,
    autoApply: plan.autoApply,
    needsReview: plan.needsReview,
    duplicates: plan.duplicates,
    byKind: order.map((kind) => ({ kind, count: counts.get(kind)! })),
    noteAddendum: patch.noteAddendum,
    residual: extraction.residual,
  };
}

// ---------------------------------------------------------------------------
// Demo fixtures — power the "Load sample" button on the review screen.
// ---------------------------------------------------------------------------

export const SAMPLE_DISCHARGE_TEXT = `DISCHARGE SUMMARY — Memorial East Hospital
Patient: Robert Garcia    MRN: MR-558210
DOB: 03/14/1959    Phone: (714) 555-0188
Insurance: Blue Shield PPO   Member ID: BSC9921

Vitals on discharge:
BP: 138/86   HR: 78   Temp: 98.4 F
Weight: 192 lbs   Height: 5'10"

Allergies: penicillin, sulfa

Discharge medications:
- Lisinopril 20 mg PO daily
- Atorvastatin 40 mg PO nightly
- Metformin 1000 mg PO BID

Active problems: E11.9 type 2 diabetes, I10 essential hypertension

Plan: Follow up with PCP in 1 week. Continue home BP log. Patient ambulating
independently and tolerating a regular diet at discharge.`;

/**
 * Representative "what's already on the chart" snapshot for the demo so
 * the review screen shows a mix of adds, conflicts, and duplicates.
 */
export const DEMO_CHART: ChartSnapshot = {
  dob: "1959-03-14", // matches the OCR DOB → duplicate
  phone: "(714) 555-0102", // differs → conflict
  externalMrn: null, // absent → add
  medications: [
    { name: "Lisinopril", doseDisplay: "10mg" }, // same drug, different dose → conflict
    { name: "Atorvastatin", doseDisplay: "40mg" }, // identical → duplicate
  ],
  allergies: [{ substance: "penicillin" }], // penicillin dup; sulfa is new
  problems: [{ icd10: "I10" }], // I10 dup; E11.9 is new
  vitals: null, // every discharge vital is a new reading
  insurance: { payer: "Aetna" }, // differs → conflict
};
