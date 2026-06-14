// ---------------------------------------------------------------------------
// Ambient Clinical Intelligence — Wearable-Augmented Insulin-Resistance engine
// (Linear EMR-1127, epic EMR-1118; FHIR serialization EMR-1130)
//
// Deterministic, side-effect-free metabolic risk core per the red-text spec
// docs/product-feedback/2026-06-12_workflows-revisions-red-text.md
// ("Proactive, Context-Aware Clinical Intelligence", Phases 2–3 + 6).
//
// The engine fuses three discrete biomarkers (fasting glucose, fasting
// insulin, HbA1c) with two continuous wearable telemetry streams (CGM
// glycemic variability + nocturnal HRV) into a single IR_risk index in
// [0,1]. Pure functions only — no DB, no UI — so it is unit-testable and
// reusable by the inline-highlight UI (EMR-1128) and the FHIR Clinical
// Reasoning layer (EMR-1130) alike.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// LOINC constants — the Structured Biomarker Stream (spec Phase 1.2)
// ---------------------------------------------------------------------------

export const BIOMARKER_LOINC = {
  /** Fasting glucose [Mass/volume] in Serum or Plasma. */
  FASTING_GLUCOSE: "74318-7",
  /** Insulin [Units/volume] in Serum or Plasma. */
  FASTING_INSULIN: "6721-6",
  /** Hemoglobin A1c / Hemoglobin.total in Blood. */
  HBA1C: "4548-4",
} as const;

/**
 * Doc Phase 4: when IR_risk breaks this threshold the UI applies a soft
 * inline tint + expands the ambient analytics sidebar. Never a pop-up.
 */
export const IR_RISK_WARN_THRESHOLD = 0.65;

/** Fasting panels older than this surface as low-confidence (never dropped). */
export const BIOMARKER_FRESHNESS_WINDOW_DAYS = 180;

/** Window over which σ_cgm (glycemic variability) is computed. */
export const CGM_VARIABILITY_WINDOW_DAYS = 14;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The discrete biochemical anchor (single-point venipuncture labs). */
export interface BiomarkerPanel {
  /** G_f — fasting plasma glucose (mg/dL). */
  fastingGlucoseMgDl?: number;
  /** I_f — fasting plasma insulin (µIU/mL). */
  fastingInsulinUIuMl?: number;
  /** HbA1c (%). Optional — amplifies risk when present. */
  hba1cPct?: number;
  /** When the fasting panel was drawn — drives the stale-data flag. */
  drawnAt?: string | Date;
}

/** A single time-series telemetry reading from a wearable. */
export interface TelemetryPoint {
  /** Measurement timestamp (ISO string or Date). */
  at: string | Date;
  value: number;
}

/** The Wearable Telemetry Cache (spec Phase 1.2). */
export interface WearableTelemetry {
  /** Continuous glucose monitor interstitial readings (mg/dL). */
  cgm?: TelemetryPoint[];
  /** Nocturnal heart-rate-variability readings (ms, e.g. RMSSD). */
  nocturnalHrv?: TelemetryPoint[];
}

/**
 * Telemetry after time-alignment (spec Phase 2 — daily downsampling +
 * rolling medians). Either produced by `normalizeTelemetry` from raw points
 * or supplied directly by a caller that already aligned the streams.
 */
export interface NormalizedTelemetry {
  /** σ_cgm — coefficient of variation (%) of CGM over the 14-day window. */
  cgmVariabilityPct: number | null;
  /** ΔHRV_sleep — reduction (ms) in recent nocturnal HRV vs the baseline. */
  hrvReductionMs: number | null;
  /** Distinct CGM days present in the variability window (confidence). */
  cgmDays: number;
  /** Distinct HRV baseline days present (confidence). */
  hrvDays: number;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Coarse classification bands over the continuous IR_risk score. */
export type IrRiskBand = "optimal" | "moderate" | "high" | "severe";

/** Which engineered feature contributed to the score. */
export type IrRiskFactorKey =
  | "homaIr"
  | "hba1c"
  | "cgmVariability"
  | "hrvReduction";

/** One feature's logit contribution — the basis for the inline tooltip. */
export interface IrRiskFactor {
  factor: IrRiskFactorKey;
  /** Normalized model input value. */
  value: number;
  weight: number;
  /** value × weight, in logits. Positive = pushes toward resistance. */
  contribution: number;
  /** Human-readable label, e.g. "HOMA-IR 3.11". */
  label: string;
}

/** Result of `computeIrRisk` — ready for the ambient sidebar + FHIR layer. */
export interface IrRiskResult {
  /** IR_risk ∈ [0,1]; 0 = optimal sensitivity, 1 = severe resistance. */
  score: number;
  band: IrRiskBand;
  /** True when score ≥ IR_RISK_WARN_THRESHOLD (drives tint + sidebar). */
  warn: boolean;
  /** HOMA-IR computed from the fasting panel (for transparency). */
  homaIr: number;
  /** Per-factor logit contributions, sorted descending. */
  factors: IrRiskFactor[];
  intercept: number;
  /** True when the fasting panel is older than the freshness window. */
  lowConfidence: boolean;
  /** Whether wearable telemetry moved the score (false = labs-only estimate). */
  wearableAugmented: boolean;
  /** ISO timestamp of the evaluation (for the audit trail). */
  evaluatedAt: string;
}
