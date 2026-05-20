// EMR-766 — LeafBridge Terminology Service (skeleton).
//
// In-process lookup for the four code systems we lean on most:
//   - LOINC      (lab + observation codes)
//   - SNOMED-CT  (clinical concepts)
//   - RxNorm     (medications)
//   - ICD-10-CM  (diagnoses)
//
// V1 stores a small hand-curated seed map. The architecture is
// deliberately a thin wrapper around a string→string table so the API
// surface is stable; the seed table grows into a versioned
// `TerminologyConcept` Prisma model in a follow-up (see ADR-006).
//
// API contract — every lookup returns { display, system, version } or
// null. Callers should treat `version` as the registry version we
// matched against, NOT a row id.

import "server-only";

export const TERMINOLOGY_SYSTEMS = ["loinc", "snomed", "rxnorm", "icd10"] as const;
export type TerminologySystem = (typeof TERMINOLOGY_SYSTEMS)[number];

export interface TerminologyHit {
  /** Code as supplied by the caller, lower/upper-cased as the system expects. */
  code: string;
  /** Human-readable display string for the code. */
  display: string;
  /** Canonical URI for the code system. */
  system: string;
  /** Registry version this lookup answered from. */
  version: string;
}

const SYSTEM_URIS: Record<TerminologySystem, string> = {
  loinc: "http://loinc.org",
  snomed: "http://snomed.info/sct",
  rxnorm: "http://www.nlm.nih.gov/research/umls/rxnorm",
  icd10: "http://hl7.org/fhir/sid/icd-10-cm",
};

const SEED_VERSION: Record<TerminologySystem, string> = {
  loinc: "2.77",
  snomed: "20240301",
  rxnorm: "20240304",
  icd10: "2024",
};

// Curated seed map. The intent is to cover the codes that ship in our
// hand-authored synthetic patient bundles ([[EMR-776]]) plus a small
// hand-picked set of high-volume cannabis-clinic codes. Real coverage
// comes from the upstream pull job in the EMR-766 follow-up.
const SEED: Record<TerminologySystem, Record<string, string>> = {
  loinc: {
    "72514-3": "Pain severity - 0-10 verbal numeric rating",
    "97546-9": "Insomnia severity index total score",
    "29463-7": "Body weight",
    "8302-2": "Body height",
    "85354-9": "Blood pressure panel with all children optional",
  },
  snomed: {
    "82423001": "Chronic pain",
    "193462001": "Insomnia",
    "73211009": "Diabetes mellitus",
    "38341003": "Hypertensive disorder",
    "44054006": "Diabetes mellitus type 2",
  },
  rxnorm: {
    "1191": "aspirin",
    "5640": "ibuprofen",
    "161": "acetaminophen",
    "2670": "codeine",
    "7052": "morphine",
  },
  icd10: {
    G89: "Pain, not elsewhere classified",
    "G47.0": "Insomnia",
    "E11.9": "Type 2 diabetes mellitus without complications",
    "I10": "Essential (primary) hypertension",
    "F41.1": "Generalized anxiety disorder",
  },
};

/**
 * Lookup a single code in a terminology system. Returns null when the
 * code is not in the seed map; in production this becomes a
 * Prisma-backed read with a 24h TTL.
 */
export function lookup(
  system: TerminologySystem,
  code: string,
): TerminologyHit | null {
  const table = SEED[system];
  // ICD-10 is case-sensitive at the letter prefix, the rest are stored
  // canonical-cased. Try exact then uppercase to be forgiving.
  const display = table[code] ?? table[code.toUpperCase()];
  if (!display) return null;
  return {
    code,
    display,
    system: SYSTEM_URIS[system],
    version: SEED_VERSION[system],
  };
}

/** Predicate type guard for path param validation. */
export function isTerminologySystem(value: string): value is TerminologySystem {
  return (TERMINOLOGY_SYSTEMS as readonly string[]).includes(value);
}
