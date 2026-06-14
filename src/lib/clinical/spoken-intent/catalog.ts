// ───────────────────────────────────────────────────────────────────────────
// EMR-1157 — Order intent catalog
// ───────────────────────────────────────────────────────────────────────────
// Maps the clinical targets a provider names out loud to codeable, schedulable
// orders. `primary` synonyms are specific phrases (high I_match); `loose`
// synonyms are generic single terms (borderline → verify queue). LOINC for
// labs (→ ServiceRequest), SNOMED for lifestyle regimens (→ CarePlan).

import type { CodeSystem, DraftKind, DraftResourceType } from "./types";

export interface IntentCatalogEntry {
  id: string;
  kind: DraftKind;
  resourceType: DraftResourceType;
  system: CodeSystem;
  code: string;
  display: string;
  /** Specific multi-word phrases → high confidence (0.93). */
  primary: string[];
  /** Generic single terms → borderline confidence (0.82). */
  loose: string[];
  /** Labs that require a fasting prep instruction. */
  fasting: boolean;
}

// Confidence weights — primary lands above the 0.88 auto-stage cutoff, loose
// below it, so a vague mention ("check her sugar") routes to verify.
export const PRIMARY_CONFIDENCE = 0.93;
export const LOOSE_CONFIDENCE = 0.82;

export const INTENT_CATALOG: IntentCatalogEntry[] = [
  // ── Labs (LOINC → ServiceRequest) ──────────────────────────────────────
  {
    id: "fasting-insulin",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "2492-2",
    display: "Insulin, fasting (serum/plasma)",
    primary: ["fasting insulin"],
    loose: ["insulin"],
    fasting: true,
  },
  {
    id: "nmr-lipoprofile",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "43396-1",
    display: "NMR LipoProfile (lipoprotein particles)",
    primary: ["nmr lipoprofile", "nmr lipoprotein", "nmr lipid panel", "lipoprofile"],
    loose: ["nmr"],
    fasting: true,
  },
  {
    id: "fasting-glucose",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "1558-6",
    display: "Glucose, fasting (serum/plasma)",
    primary: ["fasting glucose", "fasting blood sugar"],
    loose: ["glucose", "blood sugar", "sugar"],
    fasting: true,
  },
  {
    id: "hba1c",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "4548-4",
    display: "Hemoglobin A1c",
    primary: ["hemoglobin a1c", "hba1c", "a1c"],
    loose: [],
    fasting: false,
  },
  {
    id: "lipid-panel",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "57698-3",
    display: "Lipid panel",
    primary: ["lipid panel", "cholesterol panel"],
    loose: ["lipids", "cholesterol"],
    fasting: true,
  },
  {
    id: "cmp",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "24323-8",
    display: "Comprehensive metabolic panel",
    primary: ["comprehensive metabolic panel", "metabolic panel", "cmp"],
    loose: [],
    fasting: true,
  },
  {
    id: "cbc",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "58410-2",
    display: "Complete blood count with differential",
    primary: ["complete blood count", "cbc"],
    loose: [],
    fasting: false,
  },
  {
    id: "tsh",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "3016-3",
    display: "Thyroid stimulating hormone",
    primary: ["thyroid stimulating hormone", "tsh"],
    loose: ["thyroid"],
    fasting: false,
  },
  {
    id: "vitamin-d",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "1989-3",
    display: "Vitamin D, 25-hydroxy",
    primary: ["vitamin d", "25-hydroxy vitamin d"],
    loose: ["vit d"],
    fasting: false,
  },
  {
    id: "hs-crp",
    kind: "lab",
    resourceType: "ServiceRequest",
    system: "LOINC",
    code: "30522-7",
    display: "C-reactive protein, high sensitivity",
    primary: ["high sensitivity crp", "hs-crp", "c-reactive protein"],
    loose: ["crp", "inflammation"],
    fasting: false,
  },

  // ── Lifestyle regimens (SNOMED → CarePlan) ─────────────────────────────
  {
    id: "dietary-regimen",
    kind: "lifestyle",
    resourceType: "CarePlan",
    system: "SNOMED",
    code: "410606002",
    display: "Dietary regimen",
    primary: [
      "intermittent fasting",
      "time-restricted eating",
      "time restricted eating",
      "fasting schedule",
      "eating window",
      "low-carb diet",
      "ketogenic diet",
      "mediterranean diet",
    ],
    loose: ["diet", "nutrition plan"],
    fasting: false,
  },
  {
    id: "exercise-regimen",
    kind: "lifestyle",
    resourceType: "CarePlan",
    system: "SNOMED",
    code: "229065009",
    display: "Exercise regimen",
    primary: ["exercise regimen", "physical activity", "walking program", "zone 2 cardio", "strength training"],
    loose: ["exercise", "walking", "cardio"],
    fasting: false,
  },
  {
    id: "sleep-hygiene",
    kind: "lifestyle",
    resourceType: "CarePlan",
    system: "SNOMED",
    code: "226992006",
    display: "Sleep hygiene regimen",
    primary: ["sleep hygiene", "sleep schedule", "consistent bedtime"],
    loose: ["sleep"],
    fasting: false,
  },
  {
    id: "mindfulness-regimen",
    kind: "lifestyle",
    resourceType: "CarePlan",
    system: "SNOMED",
    code: "228557008",
    display: "Mindfulness / stress-reduction regimen",
    primary: ["mindfulness practice", "stress reduction", "breathing exercises", "meditation practice"],
    loose: ["meditation", "mindfulness"],
    fasting: false,
  },
];
