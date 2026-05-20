// SAFE: dead-export-allowed reason="Medical abbreviations helper for EMR-706"

/**
 * EMR-706 — Medical abbreviation registry.
 *
 * Structured registry of approved medical abbreviations sourced from:
 *   - NCCEP (North Carolina Office of EMS) approved list
 *   - Taber's Medical Dictionary
 *   - Skriber SOAP-note glossary
 *   - Heidi Health SOAP template glossary
 *
 * Used in two places:
 *   1. Note-authoring: when a provider types `BID` the editor can offer the
 *      full expansion ("twice daily"); when an expansion is ambiguous it
 *      surfaces every option so the provider picks.
 *   2. AI note generation: the model is prompted with the `audience` rule —
 *      use abbreviations naturally in clinical sections (HPI, ROS, A+P) and
 *      spell them out in patient-facing handouts.
 *
 * Pure data + lookup helpers. No I/O.
 */

export type AbbreviationCategory =
  | "vital"
  | "dose-frequency"
  | "route"
  | "exam"
  | "history"
  | "lab"
  | "lab-marker"
  | "diagnosis"
  | "lab-unit"
  | "identifier"
  | "follow-up"
  | "drug-class"
  | "imaging"
  | "discipline";

export type AbbreviationSource = "NCCEP" | "Tabers" | "Skriber" | "HeidiHealth";

export interface AbbreviationEntry {
  /** Canonical short form, case-preserved as it appears in a chart. */
  abbr: string;
  /** Full expansion in clinical English. */
  expansion: string;
  category: AbbreviationCategory;
  sources: AbbreviationSource[];
  /** Optional context note: when an abbreviation has multiple meanings,
   *  this short hint disambiguates (e.g. "BP" only ever means blood pressure
   *  here — but other abbreviations need it). */
  context?: string;
}

// Order is preserved for stable suggestion order; case is preserved verbatim.
// Categories carry the four required source attributions from the Maya Reyes
// fixture (NCCEP/Tabers/Skriber/HeidiHealth) — each abbreviation lists every
// corpus it appears in.
const REGISTRY: readonly AbbreviationEntry[] = [
  // Diagnoses
  { abbr: "HLD", expansion: "Hyperlipidemia", category: "diagnosis", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "HTN", expansion: "Hypertension", category: "diagnosis", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "DM", expansion: "Diabetes Mellitus", category: "diagnosis", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },

  // History sections
  { abbr: "PMHx", expansion: "Past Medical History", category: "history", sources: ["Skriber", "HeidiHealth"] },
  { abbr: "PSHx", expansion: "Past Surgical History", category: "history", sources: ["Skriber", "HeidiHealth"] },
  { abbr: "NKDA", expansion: "No Known Drug Allergies", category: "history", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "HPI", expansion: "History of Present Illness", category: "history", sources: ["Skriber", "HeidiHealth"] },
  { abbr: "ROS", expansion: "Review of Systems", category: "history", sources: ["Skriber", "HeidiHealth"] },

  // Vitals
  { abbr: "BP", expansion: "Blood Pressure", category: "vital", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "HR", expansion: "Heart Rate", category: "vital", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "T", expansion: "Temperature", category: "vital", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"], context: "temperature in vitals block" },
  { abbr: "RR", expansion: "Respiratory Rate", category: "vital", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "Wt", expansion: "Weight", category: "vital", sources: ["Skriber", "HeidiHealth"] },

  // Exam
  { abbr: "NCAT", expansion: "Normocephalic, Atraumatic", category: "exam", sources: ["Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "HEENT", expansion: "Head, Eyes, Ears, Nose, Throat", category: "exam", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "S1/S2", expansion: "First and second heart sounds", category: "exam", sources: ["Tabers", "Skriber", "HeidiHealth"] },

  // Labs (panels)
  { abbr: "BMP", expansion: "Basic Metabolic Panel", category: "lab", sources: ["Tabers", "Skriber", "HeidiHealth"] },

  // Lab markers
  { abbr: "eGFR", expansion: "Estimated Glomerular Filtration Rate", category: "lab-marker", sources: ["Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "HDL", expansion: "High-Density Lipoprotein", category: "lab-marker", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "VLDL", expansion: "Very-Low-Density Lipoprotein", category: "lab-marker", sources: ["Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "LDL", expansion: "Low-Density Lipoprotein", category: "lab-marker", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "ApoB", expansion: "Apolipoprotein B", category: "lab-marker", sources: ["Tabers"] },
  { abbr: "LpA", expansion: "Lipoprotein(a)", category: "lab-marker", sources: ["Tabers"] },

  // Dose / frequency
  { abbr: "qday", expansion: "once daily", category: "dose-frequency", sources: ["NCCEP", "Tabers", "Skriber"] },
  { abbr: "qHS", expansion: "at bedtime", category: "dose-frequency", sources: ["NCCEP", "Tabers", "Skriber"] },
  { abbr: "BID", expansion: "twice daily", category: "dose-frequency", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "TID", expansion: "three times daily", category: "dose-frequency", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },
  { abbr: "PRN", expansion: "as needed", category: "dose-frequency", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },

  // Route
  { abbr: "PO", expansion: "by mouth", category: "route", sources: ["NCCEP", "Tabers", "Skriber", "HeidiHealth"] },

  // Discipline / referral
  { abbr: "PT", expansion: "Physical Therapy", category: "discipline", sources: ["Tabers", "Skriber", "HeidiHealth"], context: "referral / plan" },
  { abbr: "ROM", expansion: "Range of Motion", category: "exam", sources: ["Tabers", "Skriber", "HeidiHealth"] },

  // Units
  { abbr: "mEq/L", expansion: "milliequivalents per liter", category: "lab-unit", sources: ["Tabers"] },
  { abbr: "mg/dL", expansion: "milligrams per deciliter", category: "lab-unit", sources: ["Tabers"] },
  { abbr: "mL/min/1.73m²", expansion: "milliliters per minute per 1.73 square meters", category: "lab-unit", sources: ["Tabers"] },

  // Identifiers
  { abbr: "ICD-10", expansion: "International Classification of Diseases, 10th revision", category: "identifier", sources: ["Skriber", "HeidiHealth"] },
  { abbr: "NPI", expansion: "National Provider Identifier", category: "identifier", sources: ["Skriber", "HeidiHealth"] },
  { abbr: "DEA", expansion: "Drug Enforcement Administration number", category: "identifier", sources: ["Skriber", "HeidiHealth"] },
  { abbr: "MA", expansion: "Medical Assistant", category: "identifier", sources: ["Skriber", "HeidiHealth"] },

  // Follow-up notations
  { abbr: "f/u", expansion: "follow up", category: "follow-up", sources: ["Skriber", "HeidiHealth"] },
  { abbr: "qYear", expansion: "yearly", category: "follow-up", sources: ["Skriber"] },

  // Drug classes
  { abbr: "ACE inhibitor", expansion: "Angiotensin-Converting Enzyme inhibitor", category: "drug-class", sources: ["Tabers", "Skriber"] },
  { abbr: "SGLT2", expansion: "Sodium-Glucose Cotransporter-2 inhibitor", category: "drug-class", sources: ["Tabers", "Skriber"] },
];

// Build lookup maps once at module load. Both keys are lower-cased.
const BY_ABBR = new Map<string, AbbreviationEntry[]>();
for (const entry of REGISTRY) {
  const key = entry.abbr.toLowerCase();
  const bucket = BY_ABBR.get(key) ?? [];
  bucket.push(entry);
  BY_ABBR.set(key, bucket);
}

export function listAbbreviations(): readonly AbbreviationEntry[] {
  return REGISTRY;
}

export function lookupAbbreviation(token: string): AbbreviationEntry[] {
  return BY_ABBR.get(token.toLowerCase()) ?? [];
}

/**
 * True when a single expansion exists for this token — i.e. safe to
 * auto-expand on tab without prompting the user.
 */
export function hasUnambiguousExpansion(token: string): boolean {
  return lookupAbbreviation(token).length === 1;
}

/**
 * Suggest expansions for an in-progress token (typeahead). Returns at most
 * `limit` matches whose abbreviation starts with the supplied prefix.
 */
export function suggestExpansions(prefix: string, limit = 8): AbbreviationEntry[] {
  if (prefix.length === 0) return [];
  const p = prefix.toLowerCase();
  const out: AbbreviationEntry[] = [];
  for (const entry of REGISTRY) {
    if (entry.abbr.toLowerCase().startsWith(p)) {
      out.push(entry);
      if (out.length === limit) break;
    }
  }
  return out;
}

/**
 * Expand every known abbreviation in a string (word-boundary match, case
 * insensitive). Used in patient-facing handout generation, where the rule is
 * "spell things out for the patient." Multi-meaning tokens are left intact
 * to avoid the wrong substitution — the caller can prompt the human.
 */
export function expandAbbreviationsForPatient(text: string): string {
  return text.replace(/\b[A-Za-z0-9/]+\b/g, (token) => {
    const matches = lookupAbbreviation(token);
    if (matches.length !== 1) return token;
    return matches[0].expansion;
  });
}
