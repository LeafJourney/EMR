// EMR-959 — ICD-10 search source for the eligibility ICD-10 picker.
//
// PRIMARY SOURCE: this REUSES the curated, cannabis/psilocybin-focused
// dataset that already ships in `@/lib/domain/cannabis-icd10`
// (THERAPEUTIC_INDICATIONS — chronic pain, anxiety, PTSD, insomnia,
// nausea, epilepsy, MS spasticity, cancer, glaucoma, IBD, migraine, …).
//
// We layer on a small curated set of common primary-care / intake codes
// that the eligibility workflow tends to touch but that aren't part of the
// cannabis therapeutic map. This combined list is a CURATED STARTER SET —
// it is intentionally small and is meant to be replaced by the full
// ICD-10-CM code book (see the LeafBridge terminology service, EMR-766,
// `src/lib/terminology/index.ts`) once the upstream pull job ships.

import { THERAPEUTIC_INDICATIONS } from "@/lib/domain/cannabis-icd10";

export interface Icd10Entry {
  code: string;
  description: string;
}

// Curated common primary-care / intake codes that complement the
// cannabis therapeutic map above. Keep this list intentionally short —
// it is a starter set, not the full code book.
const COMMON_PRIMARY_CARE: Icd10Entry[] = [
  { code: "I10", description: "Essential (primary) hypertension" },
  { code: "E11.9", description: "Type 2 diabetes mellitus without complications" },
  { code: "E78.5", description: "Hyperlipidemia, unspecified" },
  { code: "J45.909", description: "Unspecified asthma, uncomplicated" },
  { code: "J44.9", description: "Chronic obstructive pulmonary disease, unspecified" },
  { code: "K21.9", description: "Gastro-esophageal reflux disease without esophagitis" },
  { code: "E66.9", description: "Obesity, unspecified" },
  { code: "E03.9", description: "Hypothyroidism, unspecified" },
  { code: "N39.0", description: "Urinary tract infection, site not specified" },
  { code: "M54.5", description: "Low back pain" },
  { code: "M25.50", description: "Pain in unspecified joint" },
  { code: "R51.9", description: "Headache, unspecified" },
  { code: "R53.83", description: "Other fatigue" },
  { code: "F41.9", description: "Anxiety disorder, unspecified" },
  { code: "F32.9", description: "Major depressive disorder, single episode, unspecified" },
  { code: "F31.9", description: "Bipolar disorder, unspecified" },
  { code: "F90.9", description: "Attention-deficit hyperactivity disorder, unspecified type" },
  { code: "R10.9", description: "Unspecified abdominal pain" },
  { code: "R11.0", description: "Nausea" },
  { code: "Z00.00", description: "Encounter for general adult medical exam without abnormal findings" },
  { code: "Z79.899", description: "Other long-term (current) drug therapy" },
  { code: "Z51.81", description: "Encounter for therapeutic drug level monitoring" },
];

// De-duplicated combined library: cannabis therapeutic indications first
// (they are the platform focus), then any primary-care codes not already
// represented. Map cannabis entries to the {code, description} contract.
export const ICD10_LIBRARY: Icd10Entry[] = (() => {
  const seen = new Set<string>();
  const out: Icd10Entry[] = [];

  for (const ind of THERAPEUTIC_INDICATIONS) {
    const code = ind.icd10.toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ code: ind.icd10, description: ind.condition });
  }

  for (const entry of COMMON_PRIMARY_CARE) {
    const code = entry.code.toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(entry);
  }

  return out;
})();

/**
 * Search the curated ICD-10 starter set by code OR diagnosis term.
 *
 * Ranking (lower score sorts first):
 *   0 — code starts with the query (e.g. "F41" → F41.1)
 *   1 — description starts with the query word
 *   2 — code contains the query
 *   3 — description contains the query (substring)
 * Ties broken alphabetically by code.
 *
 * Returns ALL matches; callers can slice to the top N for typeahead.
 */
export function searchIcd10(query: string): Icd10Entry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICD10_LIBRARY;

  const scored: Array<{ entry: Icd10Entry; score: number }> = [];

  for (const entry of ICD10_LIBRARY) {
    const code = entry.code.toLowerCase();
    const desc = entry.description.toLowerCase();

    let score: number | null = null;
    if (code.startsWith(q)) score = 0;
    else if (desc.startsWith(q)) score = 1;
    else if (code.includes(q)) score = 2;
    else if (desc.includes(q)) score = 3;

    if (score !== null) scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.entry.code.localeCompare(b.entry.code);
  });

  return scored.map((s) => s.entry);
}
