/**
 * Pre-flight rules tables — seedable, deterministic, no DB access.
 * ----------------------------------------------------------------
 * Two tables back the denial-probability feature extractor:
 *
 *  1. NCCI edit pairs (procedure-to-procedure). Same shape as the
 *     starter table inside `src/lib/billing/scrub.ts` (EMR-222 tracks
 *     the full CMS table migration). The pre-flight engine merges this
 *     seed with whatever `scrubClaim` reports so the two engines never
 *     disagree on a pair both know about.
 *
 *  2. LCD/NCD coverage rules: approved CPT↔ICD-10 coding pairs plus the
 *     documentation keywords a payer's LCD requires in the narrative
 *     note to justify the service. This is the seed for the
 *     "Automated LCD/NCD Parsing" phase of the RCM spec — a future
 *     loader replaces/extends the seed from the CMS coverage database;
 *     callers can already inject their own table via PreflightOptions.
 */

// ---------------------------------------------------------------------------
// NCCI procedure-to-procedure pairs
// ---------------------------------------------------------------------------

export interface NcciEditPair {
  /** The code that gets denied when billed with `comprehensiveCode`. */
  componentCode: string;
  comprehensiveCode: string;
  /** Modifier that unbundles the pair (placed on the comprehensive /
   *  E&M line). `null` = never unbundleable — a true unbundling
   *  conflict that can only be fixed by dropping the component line. */
  allowedModifier: "25" | "59" | null;
  description: string;
}

export const PREFLIGHT_NCCI_PAIRS: NcciEditPair[] = [
  // E&M + therapeutic injection on the same day — the canonical
  // Modifier-25 scenario from the RCM spec (99214 + 96372).
  { componentCode: "96372", comprehensiveCode: "99212", allowedModifier: "25", description: "Therapeutic injection (96372) bundles into same-day E/M without Modifier-25 on the E/M line." },
  { componentCode: "96372", comprehensiveCode: "99213", allowedModifier: "25", description: "Therapeutic injection (96372) bundles into same-day E/M without Modifier-25 on the E/M line." },
  { componentCode: "96372", comprehensiveCode: "99214", allowedModifier: "25", description: "Therapeutic injection (96372) bundles into same-day E/M without Modifier-25 on the E/M line." },
  { componentCode: "96372", comprehensiveCode: "99215", allowedModifier: "25", description: "Therapeutic injection (96372) bundles into same-day E/M without Modifier-25 on the E/M line." },
  // Venipuncture is incidental to the visit — never unbundleable.
  { componentCode: "36415", comprehensiveCode: "99213", allowedModifier: null, description: "Venipuncture is incidental to an office visit and is never separately billable." },
  { componentCode: "36415", comprehensiveCode: "99214", allowedModifier: null, description: "Venipuncture is incidental to an office visit and is never separately billable." },
  // Classic surgical unbundle: diagnostic knee arthroscopy is a
  // component of surgical meniscectomy on the same knee.
  { componentCode: "29870", comprehensiveCode: "29881", allowedModifier: null, description: "Diagnostic arthroscopy (29870) is a component of surgical meniscectomy (29881) — comprehensive code includes it." },
];

// ---------------------------------------------------------------------------
// LCD / NCD coverage rules (approved coding pairs + documentation rules)
// ---------------------------------------------------------------------------

export interface LcdCoverageRule {
  cptCode: string;
  /** ICD-10-CM prefixes that constitute a covered pairing. */
  approvedIcdPrefixes: string[];
  /** Clinical keywords the LCD requires somewhere in the narrative
   *  note to justify reimbursement (lower-cased substring match). */
  requiredDocKeywords: string[];
  description: string;
}

export const PREFLIGHT_LCD_RULES: LcdCoverageRule[] = [
  // Established-patient E/M — broadly covered for the cannabis-care
  // diagnosis hot list; no special documentation keywords beyond the
  // narrative-quality features.
  ...["99212", "99213", "99214", "99215"].map((cpt) => ({
    cptCode: cpt,
    approvedIcdPrefixes: ["F32", "F33", "F41", "F43", "G43", "G47", "G89", "M54", "M79", "R51", "Z71"],
    requiredDocKeywords: [],
    description: "Established-patient E/M with a supported behavioral / pain / sleep diagnosis.",
  })),
  // New-patient E/M.
  ...["99203", "99204", "99205"].map((cpt) => ({
    cptCode: cpt,
    approvedIcdPrefixes: ["F32", "F33", "F41", "F43", "G43", "G47", "G89", "M54", "M79", "R51", "Z71"],
    requiredDocKeywords: [],
    description: "New-patient E/M with a supported behavioral / pain / sleep diagnosis.",
  })),
  // Therapeutic injection — covered for deficiency / pain dx.
  {
    cptCode: "96372",
    approvedIcdPrefixes: ["D51", "E53", "G89", "M54", "M79", "Z23"],
    requiredDocKeywords: [],
    description: "Therapeutic/diagnostic injection for documented deficiency, pain, or immunization indication.",
  },
  // Brain MRI with + without contrast — the spec's medical-necessity
  // example. Plain headache (R51) is NOT an approved pairing; the LCD
  // requires red-flag indicators or documented treatment failure.
  {
    cptCode: "70553",
    approvedIcdPrefixes: ["C71", "G43.7", "G40", "I63", "R56", "S06"],
    requiredDocKeywords: [
      "treatment failure",
      "neurological deficit",
      "red flag",
      "papilledema",
      "thunderclap",
    ],
    description:
      "Brain MRI requires a high-acuity diagnosis (tumor, refractory migraine, stroke, seizure, trauma) AND documented red-flag indicators or treatment failure.",
  },
];

/** Per-line LCD distance when the CPT has no rule on file — mildly
 *  elevated (unknown coverage), not alarming. */
export const UNKNOWN_CPT_LCD_DELTA = 0.1;
