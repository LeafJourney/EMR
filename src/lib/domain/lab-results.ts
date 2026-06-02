// Lab Results Viewer — rich display with trends and interpretation
// Standalone lab results interface beyond basic document view.

export type LabStatus = "normal" | "low" | "high" | "critical_low" | "critical_high";

export interface LabResult {
  id: string;
  name: string;
  value: number;
  unit: string;
  // Optional: real lab feeds may omit a reference range for a marker, in
  // which case the UI renders a dash rather than a fabricated "0 – 0" range.
  referenceRange?: { low: number; high: number };
  criticalRange?: { low: number; high: number };
  status: LabStatus;
  collectedAt: string;
  resultedAt: string;
  interpretation?: string;
  cannabisRelevance?: string;
}

export interface LabPanel {
  id: string;
  name: string;
  orderedAt: string;
  collectedAt: string;
  resultedAt: string;
  status: "pending" | "partial" | "complete";
  results: LabResult[];
}

// ── Status classification ──────────────────────────────

export function classifyLabValue(value: number, ref: { low: number; high: number }, crit?: { low: number; high: number }): LabStatus {
  if (crit) {
    if (value <= crit.low) return "critical_low";
    if (value >= crit.high) return "critical_high";
  }
  if (value < ref.low) return "low";
  if (value > ref.high) return "high";
  return "normal";
}

export const STATUS_COLORS: Record<LabStatus, { bg: string; text: string; label: string }> = {
  normal: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Normal" },
  low: { bg: "bg-blue-50", text: "text-blue-700", label: "Low" },
  high: { bg: "bg-amber-50", text: "text-amber-700", label: "High" },
  critical_low: { bg: "bg-red-50", text: "text-red-700", label: "Critical Low" },
  critical_high: { bg: "bg-red-50", text: "text-red-700", label: "Critical High" },
};

// ── Real LabResult → view-model mapping (EMR-806) ───────
//
// Pure helpers (no Prisma) so the patient portal's lab loader can be unit
// tested without a database. The DB query lives in `lab-results-loader.ts`.

interface RawMarker {
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
  abnormal: boolean;
}

export interface LabResultRow {
  id: string;
  panelName: string;
  receivedAt: Date;
  results: unknown;
  signedAt: Date | null;
}

/**
 * Parse the `LabResult.results` JSON, whose documented shape is
 * `{ markerName: { value, unit, refLow?, refHigh?, abnormal } }`. Markers that
 * are malformed (missing a numeric value) are dropped rather than rendered as
 * bogus rows.
 */
function parseMarkers(raw: unknown): Array<[string, RawMarker]> {
  if (!raw || typeof raw !== "object") return [];
  const out: Array<[string, RawMarker]> = [];
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const m = value as Record<string, unknown>;
    if (typeof m.value !== "number") continue;
    out.push([
      name,
      {
        value: m.value,
        unit: typeof m.unit === "string" ? m.unit : "",
        refLow: typeof m.refLow === "number" ? m.refLow : undefined,
        refHigh: typeof m.refHigh === "number" ? m.refHigh : undefined,
        abnormal: m.abnormal === true,
      },
    ]);
  }
  return out;
}

/** Map one real `LabResult` row into the portal's `LabPanel` view model. */
export function mapLabResultRow(row: LabResultRow): LabPanel {
  const iso = row.receivedAt.toISOString();
  const results: LabResult[] = parseMarkers(row.results).map(([name, m]) => {
    const referenceRange =
      m.refLow != null && m.refHigh != null
        ? { low: m.refLow, high: m.refHigh }
        : undefined;
    // Prefer a precise classification when we have a reference range; fall
    // back to the row's denormalized `abnormal` flag (direction unknown, so
    // surface it as out-of-range rather than inventing critical bounds).
    const status: LabStatus = referenceRange
      ? classifyLabValue(m.value, referenceRange)
      : m.abnormal
        ? "high"
        : "normal";
    return {
      id: `${row.id}:${name}`,
      name,
      value: m.value,
      unit: m.unit,
      referenceRange,
      status,
      collectedAt: iso,
      resultedAt: iso,
    };
  });

  return {
    id: row.id,
    name: row.panelName,
    orderedAt: iso,
    collectedAt: iso,
    resultedAt: iso,
    // A received-but-unsigned result is real but still awaiting clinician
    // sign-off — surface that honestly rather than claiming "complete".
    status: row.signedAt ? "complete" : "partial",
    results,
  };
}

// ── Demo lab panels ────────────────────────────────────

export function generateDemoLabPanels(): LabPanel[] {
  const now = new Date();
  const d = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();

  return [
    {
      id: "panel-1",
      name: "Comprehensive Metabolic Panel",
      orderedAt: d(7), collectedAt: d(6), resultedAt: d(5),
      status: "complete",
      results: [
        { id: "l1", name: "Glucose", value: 95, unit: "mg/dL", referenceRange: { low: 70, high: 100 }, status: "normal", collectedAt: d(6), resultedAt: d(5), interpretation: "Fasting glucose within normal limits." },
        { id: "l2", name: "Creatinine", value: 1.0, unit: "mg/dL", referenceRange: { low: 0.7, high: 1.3 }, criticalRange: { low: 0.4, high: 4.0 }, status: "normal", collectedAt: d(6), resultedAt: d(5), interpretation: "Normal kidney function.", cannabisRelevance: "Cannabis metabolites are primarily hepatically cleared; renal function is relevant for overall drug clearance." },
        { id: "l3", name: "ALT", value: 62, unit: "U/L", referenceRange: { low: 7, high: 55 }, criticalRange: { low: 0, high: 200 }, status: "high", collectedAt: d(6), resultedAt: d(5), interpretation: "Mildly elevated. May indicate liver stress.", cannabisRelevance: "High-dose CBD (>300mg/day) can elevate liver enzymes. Monitor if patient is on high CBD doses or concurrent hepatotoxic medications (e.g., valproate)." },
        { id: "l4", name: "AST", value: 38, unit: "U/L", referenceRange: { low: 10, high: 40 }, status: "normal", collectedAt: d(6), resultedAt: d(5) },
        { id: "l5", name: "Sodium", value: 140, unit: "mEq/L", referenceRange: { low: 136, high: 145 }, status: "normal", collectedAt: d(6), resultedAt: d(5) },
        { id: "l6", name: "Potassium", value: 4.2, unit: "mEq/L", referenceRange: { low: 3.5, high: 5.0 }, status: "normal", collectedAt: d(6), resultedAt: d(5) },
        { id: "l7", name: "BUN", value: 15, unit: "mg/dL", referenceRange: { low: 7, high: 20 }, status: "normal", collectedAt: d(6), resultedAt: d(5) },
        { id: "l8", name: "Calcium", value: 9.5, unit: "mg/dL", referenceRange: { low: 8.5, high: 10.5 }, status: "normal", collectedAt: d(6), resultedAt: d(5) },
      ],
    },
    {
      id: "panel-2",
      name: "Lipid Panel",
      orderedAt: d(7), collectedAt: d(6), resultedAt: d(5),
      status: "complete",
      results: [
        { id: "l9", name: "Total Cholesterol", value: 215, unit: "mg/dL", referenceRange: { low: 0, high: 200 }, status: "high", collectedAt: d(6), resultedAt: d(5), interpretation: "Borderline high. Consider lifestyle modifications." },
        { id: "l10", name: "HDL", value: 55, unit: "mg/dL", referenceRange: { low: 40, high: 999 }, status: "normal", collectedAt: d(6), resultedAt: d(5), interpretation: "Protective HDL level." },
        { id: "l11", name: "LDL", value: 135, unit: "mg/dL", referenceRange: { low: 0, high: 130 }, status: "high", collectedAt: d(6), resultedAt: d(5), interpretation: "Slightly elevated. Monitor at next visit." },
        { id: "l12", name: "Triglycerides", value: 125, unit: "mg/dL", referenceRange: { low: 0, high: 150 }, status: "normal", collectedAt: d(6), resultedAt: d(5) },
      ],
    },
    {
      id: "panel-3",
      name: "CBC",
      orderedAt: d(30), collectedAt: d(29), resultedAt: d(28),
      status: "complete",
      results: [
        { id: "l13", name: "WBC", value: 7.2, unit: "K/uL", referenceRange: { low: 4.5, high: 11.0 }, status: "normal", collectedAt: d(29), resultedAt: d(28) },
        { id: "l14", name: "RBC", value: 4.8, unit: "M/uL", referenceRange: { low: 4.2, high: 5.9 }, status: "normal", collectedAt: d(29), resultedAt: d(28) },
        { id: "l15", name: "Hemoglobin", value: 14.5, unit: "g/dL", referenceRange: { low: 12.0, high: 17.5 }, status: "normal", collectedAt: d(29), resultedAt: d(28) },
        { id: "l16", name: "Platelets", value: 250, unit: "K/uL", referenceRange: { low: 150, high: 400 }, status: "normal", collectedAt: d(29), resultedAt: d(28) },
      ],
    },
  ];
}
