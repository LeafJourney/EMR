/**
 * EMR-083 — Pediatric growth-chart helpers
 *
 * Pure helpers for the chart-side pediatric overlay:
 *
 *   - `bmi` — standard kg/m² calc
 *   - `cdcBmiCategory` — CDC's 2-20 BMI-for-age category labels
 *     (underweight / healthy / overweight / obese) by age + sex.
 *     We don't yet ship the full LMS percentile tables — instead we
 *     use the CDC-published age-banded cutoffs from the 2000 Growth
 *     Charts which clinicians use at the point of care.
 *   - `nextWellChild` — next AAP-recommended well-child visit relative
 *     to the patient's current age in months
 *   - `immunizationsDue` — given a list of completed CVX codes + age
 *     in months, return the next ACIP-due vaccines (subset: core
 *     primary series). Enough to drive the "what's due" tile.
 *
 * Real-time clinical decisions should still go through the CDC tools;
 * these helpers are for chart cues + reminder generation only.
 */

export type Sex = "male" | "female";

export type BmiCategory =
  | "underweight" // < 5th
  | "healthy" // 5th – <85th
  | "overweight" // 85th – <95th
  | "obese"; // ≥ 95th

export interface BmiCutoffs {
  underweightMax: number;
  healthyMax: number;
  overweightMax: number;
}

/**
 * Approximate CDC BMI-for-age cutoffs (kg/m²) at 5th / 85th / 95th
 * percentiles, in 2-year bands. Lifted from the CDC 2-20 growth charts.
 */
const CDC_BMI_BANDS: Record<Sex, Array<{ ageYears: number; cutoffs: BmiCutoffs }>> = {
  male: [
    { ageYears: 2, cutoffs: { underweightMax: 14.7, healthyMax: 17.5, overweightMax: 18.4 } },
    { ageYears: 4, cutoffs: { underweightMax: 13.8, healthyMax: 16.8, overweightMax: 17.8 } },
    { ageYears: 6, cutoffs: { underweightMax: 13.7, healthyMax: 17.0, overweightMax: 18.0 } },
    { ageYears: 8, cutoffs: { underweightMax: 14.1, healthyMax: 17.8, overweightMax: 19.3 } },
    { ageYears: 10, cutoffs: { underweightMax: 14.4, healthyMax: 19.6, overweightMax: 21.4 } },
    { ageYears: 12, cutoffs: { underweightMax: 14.9, healthyMax: 21.0, overweightMax: 23.0 } },
    { ageYears: 14, cutoffs: { underweightMax: 15.7, healthyMax: 22.5, overweightMax: 25.0 } },
    { ageYears: 16, cutoffs: { underweightMax: 16.5, healthyMax: 23.9, overweightMax: 26.6 } },
    { ageYears: 18, cutoffs: { underweightMax: 17.3, healthyMax: 24.9, overweightMax: 27.7 } },
    { ageYears: 20, cutoffs: { underweightMax: 17.6, healthyMax: 25.5, overweightMax: 28.5 } },
  ],
  female: [
    { ageYears: 2, cutoffs: { underweightMax: 14.4, healthyMax: 17.2, overweightMax: 18.0 } },
    { ageYears: 4, cutoffs: { underweightMax: 13.6, healthyMax: 16.8, overweightMax: 17.8 } },
    { ageYears: 6, cutoffs: { underweightMax: 13.5, healthyMax: 17.0, overweightMax: 18.4 } },
    { ageYears: 8, cutoffs: { underweightMax: 13.9, healthyMax: 18.3, overweightMax: 20.0 } },
    { ageYears: 10, cutoffs: { underweightMax: 14.4, healthyMax: 19.9, overweightMax: 22.0 } },
    { ageYears: 12, cutoffs: { underweightMax: 15.0, healthyMax: 21.6, overweightMax: 24.0 } },
    { ageYears: 14, cutoffs: { underweightMax: 15.8, healthyMax: 23.0, overweightMax: 25.7 } },
    { ageYears: 16, cutoffs: { underweightMax: 16.5, healthyMax: 24.1, overweightMax: 27.0 } },
    { ageYears: 18, cutoffs: { underweightMax: 17.0, healthyMax: 24.8, overweightMax: 28.0 } },
    { ageYears: 20, cutoffs: { underweightMax: 17.6, healthyMax: 25.5, overweightMax: 28.7 } },
  ],
};

export function bmi(weightKg: number, heightCm: number): number {
  if (heightCm <= 0 || weightKg <= 0) return NaN;
  const meters = heightCm / 100;
  return weightKg / (meters * meters);
}

function lookupCutoffs(sex: Sex, ageYears: number): BmiCutoffs {
  const bands = CDC_BMI_BANDS[sex];
  // Clamp to the supported band range.
  if (ageYears <= bands[0]!.ageYears) return bands[0]!.cutoffs;
  if (ageYears >= bands[bands.length - 1]!.ageYears) return bands[bands.length - 1]!.cutoffs;
  // Linear interpolation between the two nearest bands.
  for (let i = 0; i < bands.length - 1; i++) {
    const lo = bands[i]!;
    const hi = bands[i + 1]!;
    if (ageYears >= lo.ageYears && ageYears <= hi.ageYears) {
      const t = (ageYears - lo.ageYears) / (hi.ageYears - lo.ageYears);
      return {
        underweightMax: interp(lo.cutoffs.underweightMax, hi.cutoffs.underweightMax, t),
        healthyMax: interp(lo.cutoffs.healthyMax, hi.cutoffs.healthyMax, t),
        overweightMax: interp(lo.cutoffs.overweightMax, hi.cutoffs.overweightMax, t),
      };
    }
  }
  return bands[bands.length - 1]!.cutoffs;
}

function interp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function cdcBmiCategory(
  bmiValue: number,
  ageYears: number,
  sex: Sex,
): BmiCategory {
  const c = lookupCutoffs(sex, ageYears);
  if (bmiValue < c.underweightMax) return "underweight";
  if (bmiValue < c.healthyMax) return "healthy";
  if (bmiValue < c.overweightMax) return "overweight";
  return "obese";
}

/** Clinician-facing labels for each BMI-for-age category. */
export const BMI_CATEGORY_LABELS: Record<BmiCategory, string> = {
  underweight: "Underweight (<5th %ile)",
  healthy: "Healthy weight (5th–85th)",
  overweight: "Overweight (85th–95th)",
  obese: "Obese (≥95th %ile)",
};

// ---------------------------------------------------------------------------
// AAP well-child schedule (Bright Futures, abbreviated)
// ---------------------------------------------------------------------------

/** Months at which AAP recommends a well-child visit. */
export const WELL_CHILD_MONTHS = [
  0, 1, 2, 4, 6, 9, 12, 15, 18, 24, 30,
  36, 48, 60, 72, 84, 96, 108, 120,
  132, 144, 156, 168, 180, 192, 204, 216,
];

export function nextWellChild(ageMonths: number): number | null {
  for (const m of WELL_CHILD_MONTHS) {
    if (m > ageMonths) return m;
  }
  return null;
}

// ---------------------------------------------------------------------------
// ACIP immunization schedule — abbreviated core series
// ---------------------------------------------------------------------------

export interface VaccineDose {
  /** Short label clinicians recognize. */
  label: string;
  /** Earliest age in months this dose can be given. */
  earliestMonths: number;
  /** "Past due" threshold — once a child passes this without the dose,
   *  it's flagged urgent. */
  catchUpMonths: number;
  /** CVX code lots and registries key by. */
  cvx: string;
  /** Order within a series (1 = first dose, 2 = second, etc.). */
  doseNumber: number;
}

export const PRIMARY_SERIES: VaccineDose[] = [
  { label: "Hep B #1", earliestMonths: 0, catchUpMonths: 2, cvx: "08", doseNumber: 1 },
  { label: "Hep B #2", earliestMonths: 1, catchUpMonths: 4, cvx: "08", doseNumber: 2 },
  { label: "Hep B #3", earliestMonths: 6, catchUpMonths: 18, cvx: "08", doseNumber: 3 },
  { label: "DTaP #1", earliestMonths: 2, catchUpMonths: 4, cvx: "20", doseNumber: 1 },
  { label: "DTaP #2", earliestMonths: 4, catchUpMonths: 6, cvx: "20", doseNumber: 2 },
  { label: "DTaP #3", earliestMonths: 6, catchUpMonths: 9, cvx: "20", doseNumber: 3 },
  { label: "DTaP #4", earliestMonths: 15, catchUpMonths: 19, cvx: "20", doseNumber: 4 },
  { label: "DTaP #5", earliestMonths: 48, catchUpMonths: 84, cvx: "20", doseNumber: 5 },
  { label: "Hib #1", earliestMonths: 2, catchUpMonths: 4, cvx: "17", doseNumber: 1 },
  { label: "Hib #2", earliestMonths: 4, catchUpMonths: 6, cvx: "17", doseNumber: 2 },
  { label: "Hib #3", earliestMonths: 12, catchUpMonths: 18, cvx: "17", doseNumber: 3 },
  { label: "IPV #1", earliestMonths: 2, catchUpMonths: 4, cvx: "10", doseNumber: 1 },
  { label: "IPV #2", earliestMonths: 4, catchUpMonths: 6, cvx: "10", doseNumber: 2 },
  { label: "IPV #3", earliestMonths: 6, catchUpMonths: 18, cvx: "10", doseNumber: 3 },
  { label: "IPV #4", earliestMonths: 48, catchUpMonths: 84, cvx: "10", doseNumber: 4 },
  { label: "PCV13 #1", earliestMonths: 2, catchUpMonths: 4, cvx: "133", doseNumber: 1 },
  { label: "PCV13 #2", earliestMonths: 4, catchUpMonths: 6, cvx: "133", doseNumber: 2 },
  { label: "PCV13 #3", earliestMonths: 6, catchUpMonths: 9, cvx: "133", doseNumber: 3 },
  { label: "PCV13 #4", earliestMonths: 12, catchUpMonths: 18, cvx: "133", doseNumber: 4 },
  { label: "MMR #1", earliestMonths: 12, catchUpMonths: 18, cvx: "03", doseNumber: 1 },
  { label: "MMR #2", earliestMonths: 48, catchUpMonths: 84, cvx: "03", doseNumber: 2 },
  { label: "Varicella #1", earliestMonths: 12, catchUpMonths: 18, cvx: "21", doseNumber: 1 },
  { label: "Varicella #2", earliestMonths: 48, catchUpMonths: 84, cvx: "21", doseNumber: 2 },
];

export interface CompletedDose {
  cvx: string;
  doseNumber: number;
}

export interface VaccineGap {
  dose: VaccineDose;
  status: "due" | "overdue";
  monthsUntilOverdue: number;
}

export function immunizationsDue(
  ageMonths: number,
  completed: CompletedDose[],
): VaccineGap[] {
  const done = new Set(completed.map((c) => `${c.cvx}#${c.doseNumber}`));
  const gaps: VaccineGap[] = [];
  for (const dose of PRIMARY_SERIES) {
    const key = `${dose.cvx}#${dose.doseNumber}`;
    if (done.has(key)) continue;
    if (ageMonths < dose.earliestMonths) continue; // not yet eligible
    const overdue = ageMonths >= dose.catchUpMonths;
    gaps.push({
      dose,
      status: overdue ? "overdue" : "due",
      monthsUntilOverdue: Math.max(0, dose.catchUpMonths - ageMonths),
    });
  }
  return gaps;
}
