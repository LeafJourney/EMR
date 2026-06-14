// ───────────────────────────────────────────────────────────────────────────
// EMR-1157 — Spoken-intent order drafting: shared types
// ───────────────────────────────────────────────────────────────────────────
// Doc "Autonomous Order & Script Drafting" (epic EMR-1124). A provider's spoken
// or typed directive is parsed into draft, codeable orders that stage silently
// in the encounter checkout queue until the provider signs. Nothing transmits
// while a draft has intent="draft".
//
// FHIR-shaped on purpose: lab/imaging requests serialize as ServiceRequest,
// lifestyle/dietary regimens as CarePlan — the card's acceptance fixture asserts
// the doc utterance yields exactly 2 ServiceRequests + 1 CarePlan.

export type DraftResourceType = "ServiceRequest" | "CarePlan";
export type DraftKind = "lab" | "imaging" | "lifestyle";
export type CodeSystem = "LOINC" | "SNOMED" | "internal";

export interface CodeableConcept {
  system: CodeSystem;
  code: string;
  display: string;
}

/** Concrete scheduling window resolved from a temporal phrase ("next week"). */
export interface OccurrencePeriod {
  /** ISO-8601 start of the window. */
  start: string;
  /** ISO-8601 end of the window. */
  end: string;
  /** The phrase that produced it ("next week", "in 3 days"). */
  label: string;
}

export interface FastingModifier {
  required: boolean;
  /** Patient-facing prep instruction appended to fasting labs. */
  instruction: string;
}

export interface DraftOrder {
  resourceType: DraftResourceType;
  kind: DraftKind;
  code: CodeableConcept;
  /** Display name for the checkout queue row. */
  name: string;
  occurrencePeriod: OccurrencePeriod | null;
  fasting: FastingModifier | null;
  /** Free detail for lifestyle regimens (e.g. the "14:10" eating window). */
  detail: string | null;
  /** Intent-match confidence I_match ∈ [0,1]. */
  confidence: number;
  /** Always "draft" — nothing is signed/transmitted by the parser. */
  intent: "draft";
  /** The matched source phrase, for provenance + the verify queue. */
  raw: string;
}

export interface ParsedIntent {
  utterance: string;
  /** I_match ≥ threshold — auto-staged drafts. */
  drafts: DraftOrder[];
  /** Below threshold — routed to the low-confidence verify queue. */
  lowConfidence: DraftOrder[];
}

/** Auto-stage cutoff from the doc (I_match ≥ 0.88). */
export const INTENT_MATCH_THRESHOLD = 0.88;

/** The 12-hour water-fast prep auto-appended to fasting labs. */
export const FASTING_INSTRUCTION =
  "Fast for 12 hours before this lab — water only, no food or other drinks.";
