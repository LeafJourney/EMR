// ---------------------------------------------------------------------------
// Prescription Safety & Optimization Guardrails — shared types
// (Linear EMR-1132/1133/1134, epic EMR-1119)
//
// Deterministic guardrail engine per the red-text spec
// docs/product-feedback/2026-06-12_workflows-revisions-red-text.md
// ("Prescription Safety & Optimization Guardrails", Phases 1–4).
//
// Three evaluation layers (PGx, organ clearance, botanical/cannabinoid)
// each produce GuardrailFinding[]; evaluate.ts merges + ranks them for the
// inline optimization card UI.
// ---------------------------------------------------------------------------

/** Severity / disposition of a guardrail finding, ordered most → least severe. */
export type GuardrailKind =
  | "hard_stop" // cancel order intent immediately (e.g. CYP2D6 UM × codeine)
  | "hard_substitution" // block order, propose alternative molecule
  | "dosing_override" // cap / adjust the proposed dose configuration
  | "optimization" // proactive suggestion (dose reduction + follow-up lab)
  | "info"; // contextual, non-actionable awareness

export type GuardrailLayer = "pgx" | "organ" | "botanical";

/** A follow-up lab the system should queue when a finding is accepted. */
export interface RequiredFollowUpLab {
  /** LOINC code of the lab to queue (e.g. "34714-6" = INR). */
  labLoinc: string;
  /** Human-readable timing, e.g. "immediate", "within 7 days". */
  timing: string;
}

/** One guardrail result, suitable for the inline optimization card. */
export interface GuardrailFinding {
  kind: GuardrailKind;
  /** Which evaluation layer produced this finding. */
  layer: GuardrailLayer;
  /** Stable identifier of the rule that fired (for audit / dedupe). */
  ruleId: string;
  /** Biological mechanism, e.g. "CYP2C19 loss-of-function → reduced active metabolite". */
  mechanism: string;
  /** Why this matters for THIS patient (phenotype, lab value, exposure). */
  rationale: string;
  /** What the provider should do instead. */
  recommendation: string;
  /** Citation metadata strings, e.g. "CPIC Level A", "CKD-EPI 2021". */
  citations: string[];
  /** Labs to queue automatically if the recommendation is accepted. */
  requiredFollowUp?: RequiredFollowUpLab[];
  /**
   * True when the finding is derived from data older than the freshness
   * window (labs > 180 days old). The finding still surfaces — it is never
   * silently dropped — but the UI should render it with a stale-data badge.
   */
  lowConfidence?: boolean;
  /** Structured extras for the UI (eGFR value, Child-Pugh class, lab dates…). */
  details?: Record<string, string | number | boolean | null>;
}

// ---------------------------------------------------------------------------
// Inputs — Phase 1.1 structural order interception payload
// ---------------------------------------------------------------------------

/** The drafted order the provider is composing in the CPOE terminal. */
export interface DraftOrder {
  /** RxNorm Concept Unique Identifier when the order field resolved one. */
  rxNormCui?: string;
  /** Drug name as typed/selected (brand or generic — matching is alias-aware). */
  drugName: string;
  /** Proposed dose as entered, e.g. "1000 mg". */
  dose?: string;
  /** Route of administration, e.g. "oral". */
  route?: string;
  /** Execution frequency, e.g. "q6h". */
  frequency?: string;
  /**
   * Structured total daily dose in mg when the order form can compute it.
   * Used by the organ layer to compare against hepatic dose caps.
   */
  dailyDoseMg?: number;
}

// ---------------------------------------------------------------------------
// Inputs — Phase 1.2 distributed multi-domain ingestion (patient profile)
// ---------------------------------------------------------------------------

/** Pharmacogenomic phenotypes the rule registry understands. */
export type PgxPhenotype =
  | "poor_metabolizer"
  | "intermediate_metabolizer"
  | "normal_metabolizer"
  | "rapid_metabolizer"
  | "ultrarapid_metabolizer"
  | "positive" // for HLA risk-allele carriage
  | "negative";

/** A structural genetic variant from the PGx registry. */
export interface PgxVariant {
  /** Gene symbol, e.g. "CYP2C19", "CYP2D6", "HLA-B". */
  gene: string;
  /** Star-allele diplotype, e.g. "*2/*3", "*1xN/*1", "*58:01". */
  diplotype?: string;
  /** Individual alleles when already split, e.g. ["*2", "*3"]. */
  alleles?: string[];
  /** Pre-resolved phenotype if the lab reported one (takes precedence). */
  phenotype?: PgxPhenotype;
}

/** A single lab observation from the Organ Clearance Vault. */
export interface LabResult {
  /** LOINC code — see LOINC constants below. */
  loinc: string;
  value: number;
  unit?: string;
  /** When the specimen was collected (ISO string or Date). */
  observedAt: string | Date;
}

/** An exposure from the Botanical & Xenobiotic Manifest. */
export interface BotanicalExposure {
  /**
   * Compound or product name, e.g. "CBD", "St. John's Wort",
   * or a cannabis product name from the dosing log ("1:1 Relief Tincture").
   */
  name: string;
  kind?: "cannabinoid" | "herbal" | "supplement";
  /** True for concentrated extracts (e.g. high-dose CBD isolate). */
  concentrated?: boolean;
  /** Where the exposure was observed, e.g. "product_log", "dosing_log". */
  source?: string;
}

export type ChildPughAscites = "absent" | "slight" | "moderate";
export type ChildPughEncephalopathyGrade = 0 | 1 | 2 | 3 | 4;

/** The assembled patient physiological state (Phase 1.2). */
export interface PatientRxProfile {
  sex: "female" | "male";
  age: number;
  /** Star-allele configurations on file. Empty array = no genomic data. */
  pgxVariants: PgxVariant[];
  /** Recent labs (creatinine 2160-0, bilirubin 1975-2, albumin 1751-7, INR 34714-6). */
  labs: LabResult[];
  /** Active medication names (brand or generic). */
  activeMeds: string[];
  /** Botanical / supplement / cannabinoid exposures incl. product & dosing logs. */
  botanicalExposures: BotanicalExposure[];
  /** Optional documented clinical flags for Child-Pugh (default: absent/none). */
  ascites?: ChildPughAscites;
  encephalopathyGrade?: ChildPughEncephalopathyGrade;
}

// ---------------------------------------------------------------------------
// LOINC constants (Organ Clearance Vault)
// ---------------------------------------------------------------------------

export const LOINC = {
  SERUM_CREATININE: "2160-0",
  TOTAL_BILIRUBIN: "1975-2",
  ALBUMIN: "1751-7",
  INR: "34714-6",
} as const;

/** Labs older than this many days are flagged lowConfidence, never dropped. */
export const LAB_FRESHNESS_WINDOW_DAYS = 180;

// ---------------------------------------------------------------------------
// Ranking + aggregate result
// ---------------------------------------------------------------------------

/** Most-severe-first ordering used to rank findings for the UI card. */
export const GUARDRAIL_KIND_RANK: Record<GuardrailKind, number> = {
  hard_stop: 0,
  hard_substitution: 1,
  dosing_override: 2,
  optimization: 3,
  info: 4,
};

/** Result of evaluateRxSafety — ready for the inline optimization card. */
export interface RxSafetyEvaluation {
  order: DraftOrder;
  /** All findings, ranked hard stops first. Empty = clean order, render nothing. */
  findings: GuardrailFinding[];
  /** True when the order should not be signed as drafted. */
  hasBlockingFinding: boolean;
  /** ISO timestamp of the evaluation (for the audit trail). */
  evaluatedAt: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Alias-aware drug matching shared by all three layers. A draft order matches
 * a rule when its RxCUI matches exactly, or when the typed name contains (or
 * is contained by) any of the rule's names — same loose matching contract the
 * existing checkInteractions() module uses.
 */
export function orderMatchesDrug(
  order: Pick<DraftOrder, "rxNormCui" | "drugName">,
  match: { rxNormCuis?: string[]; names: string[] }
): boolean {
  if (
    order.rxNormCui &&
    match.rxNormCuis &&
    match.rxNormCuis.includes(order.rxNormCui)
  ) {
    return true;
  }
  const typed = order.drugName.toLowerCase().trim();
  if (!typed) return false;
  return match.names.some((n) => {
    const name = n.toLowerCase().trim();
    return typed.includes(name) || name.includes(typed);
  });
}
