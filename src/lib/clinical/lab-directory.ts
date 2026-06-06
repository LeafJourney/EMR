/**
 * EMR-871 — Orderable lab panel directory
 *
 * Dr. Patel wants the labs section of the chart to offer a tidy, named menu
 * of panels (CBC, CMP, Lipid, PSA, Thyroid, Vitamin D, …) instead of a free
 * text box, with each panel knowing its component analytes, reference ranges,
 * and which national reference lab can run it (Quest vs LabCorp vs either).
 *
 * This pure layer powers the `/lab` slash command, the order set picker, and
 * the result-flagging logic (`isAbnormal`) that drives the red/green bubbles
 * on the results review screen. No React, no project imports.
 */

export type LabSource = "Quest Diagnostics" | "LabCorp" | "Either";

export interface LabComponent {
  name: string;
  unit: string;
  refLow?: number;
  refHigh?: number;
}

export interface LabPanelDef {
  key: string; // "cbc"
  title: string; // "CBC"
  fullName: string; // "Complete Blood Count"
  components: LabComponent[];
  source: LabSource;
  emoji: string;
}

export const LAB_PANELS: readonly LabPanelDef[] = [
  {
    key: "cbc",
    title: "CBC",
    fullName: "Complete Blood Count",
    source: "Either",
    emoji: "🩸",
    components: [
      { name: "WBC", unit: "10^3/uL", refLow: 4.0, refHigh: 11.0 },
      { name: "RBC", unit: "10^6/uL", refLow: 4.2, refHigh: 5.9 },
      { name: "Hemoglobin", unit: "g/dL", refLow: 12.0, refHigh: 17.5 },
      { name: "Hematocrit", unit: "%", refLow: 36, refHigh: 52 },
      { name: "Platelets", unit: "10^3/uL", refLow: 150, refHigh: 400 },
      { name: "MCV", unit: "fL", refLow: 80, refHigh: 100 },
    ],
  },
  {
    key: "cmp",
    title: "CMP",
    fullName: "Comprehensive Metabolic Panel",
    source: "Either",
    emoji: "🧪",
    components: [
      { name: "Sodium", unit: "mmol/L", refLow: 135, refHigh: 145 },
      { name: "Potassium", unit: "mmol/L", refLow: 3.5, refHigh: 5.1 },
      { name: "Chloride", unit: "mmol/L", refLow: 98, refHigh: 107 },
      { name: "CO2", unit: "mmol/L", refLow: 22, refHigh: 29 },
      { name: "BUN", unit: "mg/dL", refLow: 7, refHigh: 20 },
      { name: "Creatinine", unit: "mg/dL", refLow: 0.6, refHigh: 1.3 },
      { name: "Glucose", unit: "mg/dL", refLow: 70, refHigh: 99 },
      { name: "Calcium", unit: "mg/dL", refLow: 8.5, refHigh: 10.2 },
      { name: "Total Protein", unit: "g/dL", refLow: 6.0, refHigh: 8.3 },
      { name: "Albumin", unit: "g/dL", refLow: 3.5, refHigh: 5.0 },
      { name: "Total Bilirubin", unit: "mg/dL", refLow: 0.1, refHigh: 1.2 },
      { name: "ALP", unit: "U/L", refLow: 44, refHigh: 147 },
      { name: "AST", unit: "U/L", refLow: 10, refHigh: 40 },
      { name: "ALT", unit: "U/L", refLow: 7, refHigh: 56 },
      { name: "GGT", unit: "U/L", refLow: 9, refHigh: 48 },
    ],
  },
  {
    key: "lipid",
    title: "Lipid Panel",
    fullName: "Lipid Panel with ApoB and Lp(a)",
    source: "Either",
    emoji: "🫀",
    components: [
      { name: "Total Cholesterol", unit: "mg/dL", refLow: 0, refHigh: 200 },
      { name: "LDL", unit: "mg/dL", refLow: 0, refHigh: 100 },
      { name: "HDL", unit: "mg/dL", refLow: 40, refHigh: 100 },
      { name: "Triglycerides", unit: "mg/dL", refLow: 0, refHigh: 150 },
      { name: "ApoB", unit: "mg/dL", refLow: 0, refHigh: 90 },
      { name: "Lp(a)", unit: "nmol/L", refLow: 0, refHigh: 75 },
    ],
  },
  {
    key: "psa",
    title: "PSA",
    fullName: "Prostate-Specific Antigen",
    source: "Either",
    emoji: "🧍",
    components: [{ name: "PSA, Total", unit: "ng/mL", refLow: 0, refHigh: 4.0 }],
  },
  {
    key: "thyroid",
    title: "Thyroid",
    fullName: "Thyroid Panel (TSH / FT4 / FT3 / Anti-TPO)",
    source: "Either",
    emoji: "🦋",
    components: [
      { name: "TSH", unit: "mIU/L", refLow: 0.4, refHigh: 4.0 },
      { name: "Free T4", unit: "ng/dL", refLow: 0.8, refHigh: 1.8 },
      { name: "Free T3", unit: "pg/mL", refLow: 2.3, refHigh: 4.2 },
      { name: "Anti-TPO", unit: "IU/mL", refLow: 0, refHigh: 34 },
    ],
  },
  {
    key: "vitamin-d",
    title: "Vitamin D",
    fullName: "25-Hydroxy Vitamin D",
    source: "Either",
    emoji: "☀️",
    components: [
      { name: "25-OH Vitamin D", unit: "ng/mL", refLow: 30, refHigh: 100 },
    ],
  },
  {
    key: "uric-acid",
    title: "Uric Acid",
    fullName: "Serum Uric Acid",
    source: "Either",
    emoji: "🦶",
    components: [{ name: "Uric Acid", unit: "mg/dL", refLow: 3.4, refHigh: 7.0 }],
  },
  {
    key: "urine",
    title: "Urine",
    fullName: "Urinalysis with Urine Culture",
    source: "Either",
    emoji: "🚽",
    components: [
      { name: "Specific Gravity", unit: "", refLow: 1.005, refHigh: 1.03 },
      { name: "pH", unit: "", refLow: 4.5, refHigh: 8.0 },
      { name: "WBC (urine)", unit: "/hpf", refLow: 0, refHigh: 5 },
      { name: "RBC (urine)", unit: "/hpf", refLow: 0, refHigh: 3 },
      { name: "Culture CFU", unit: "CFU/mL", refLow: 0, refHigh: 10000 },
    ],
  },
  {
    key: "a1c",
    title: "A1C",
    fullName: "Hemoglobin A1c (estimated average glucose)",
    source: "Either",
    emoji: "🍬",
    components: [{ name: "HbA1c", unit: "%", refLow: 4.0, refHigh: 5.6 }],
  },
  {
    key: "hba1c",
    title: "HbA1c",
    fullName: "Hemoglobin A1c",
    source: "Either",
    emoji: "🩸",
    components: [{ name: "HbA1c", unit: "%", refLow: 4.0, refHigh: 5.6 }],
  },
  {
    key: "ferritin",
    title: "Ferritin",
    fullName: "Serum Ferritin",
    source: "Either",
    emoji: "⚙️",
    components: [{ name: "Ferritin", unit: "ng/mL", refLow: 30, refHigh: 400 }],
  },
  {
    key: "crp",
    title: "CRP",
    fullName: "C-Reactive Protein",
    source: "Either",
    emoji: "🔥",
    components: [{ name: "CRP", unit: "mg/L", refLow: 0, refHigh: 10 }],
  },
  {
    key: "hscrp",
    title: "hsCRP",
    fullName: "High-Sensitivity C-Reactive Protein",
    source: "Either",
    emoji: "🔥",
    components: [{ name: "hsCRP", unit: "mg/L", refLow: 0, refHigh: 3.0 }],
  },
];

/** Look up a panel by its stable key. */
export function labByKey(key: string): LabPanelDef | undefined {
  const needle = key.trim().toLowerCase();
  return LAB_PANELS.find((p) => p.key.toLowerCase() === needle);
}

/**
 * Is a measured value outside the component's reference range? A component
 * with no defined bounds can never be flagged abnormal.
 */
export function isAbnormal(component: LabComponent, value: number): boolean {
  if (component.refLow !== undefined && value < component.refLow) return true;
  if (component.refHigh !== undefined && value > component.refHigh) return true;
  return false;
}
