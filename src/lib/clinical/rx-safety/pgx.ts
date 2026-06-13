// ---------------------------------------------------------------------------
// Pharmacogenomic (PGx) Variant Evaluation Layer — Phase 2 of the red-text spec.
//
// CPIC-shaped rules registry mapping star-alleles → phenotype → guardrail
// action. Seeds the four anchor rules called out in the mission:
//   - Clopidogrel × CYP2C19 IM/PM            → hard_substitution
//   - Codeine/Tramadol × CYP2D6 PM           → dosing_override
//   - Codeine/Tramadol × CYP2D6 ultrarapid   → hard_stop
//   - Allopurinol × HLA-B*58:01              → hard_stop
//
// No genomic data on file for the relevant gene → silent pass (no finding),
// never a warning. This is a deliberate design point: absence of evidence is
// not a flag.
// ---------------------------------------------------------------------------

import {
  type DraftOrder,
  type GuardrailFinding,
  type PgxPhenotype,
  type PgxVariant,
  orderMatchesDrug,
} from "./types";

/** Functional category of a single star-allele (CPIC activity scoring). */
type AlleleFunction =
  | "no_function" // *2,*3,*4,*5 …
  | "decreased_function"
  | "normal_function" // *1
  | "increased_function"
  | "risk"; // HLA risk alleles

/**
 * Minimal CPIC-style allele function tables for the genes our anchor rules
 * touch. Anything not listed defaults to normal_function so an unknown allele
 * never manufactures a phenotype out of thin air.
 */
const ALLELE_FUNCTION: Record<string, Record<string, AlleleFunction>> = {
  CYP2C19: {
    "*1": "normal_function",
    "*2": "no_function",
    "*3": "no_function",
    "*17": "increased_function",
  },
  CYP2D6: {
    "*1": "normal_function",
    "*2": "normal_function",
    "*4": "no_function",
    "*5": "no_function", // gene deletion
    "*10": "decreased_function",
  },
};

/** Parse a diplotype string like "*2/*3" or "*1xN/*1" into its two alleles. */
export function parseDiplotype(diplotype: string): string[] {
  return diplotype
    .split("/")
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Detect a CYP2D6 gene-duplication allele, e.g. "*1xN" or "*2x2". */
function isDuplication(allele: string): boolean {
  return /x(n|\d+)/i.test(allele);
}

/**
 * Resolve a CYP2C19 / CYP2D6 phenotype from a variant's alleles using the
 * function tables. Used when the lab did not pre-report a phenotype.
 */
export function resolveCypPhenotype(
  gene: string,
  alleles: string[]
): PgxPhenotype {
  const table = ALLELE_FUNCTION[gene] ?? {};

  // Ultra-rapid: any functional gene duplication (xN) of a normal-fn allele.
  const hasDuplication = alleles.some(
    (a) => isDuplication(a) && table[a.replace(/x.*$/i, "")] !== "no_function"
  );
  if (hasDuplication) return "ultrarapid_metabolizer";

  const fns = alleles.map((a) => table[a] ?? "normal_function");
  const noFn = fns.filter((f) => f === "no_function").length;
  const decreased = fns.filter((f) => f === "decreased_function").length;

  if (noFn >= 2) return "poor_metabolizer";
  if (noFn === 1 && decreased >= 1) return "poor_metabolizer";
  if (noFn === 1 || decreased >= 2) return "intermediate_metabolizer";
  if (decreased === 1) return "intermediate_metabolizer";
  if (fns.includes("increased_function")) return "rapid_metabolizer";
  return "normal_metabolizer";
}

/** Resolve the effective phenotype for a variant (lab-reported wins). */
function phenotypeFor(variant: PgxVariant): PgxPhenotype {
  if (variant.phenotype) return variant.phenotype;
  const alleles =
    variant.alleles ??
    (variant.diplotype ? parseDiplotype(variant.diplotype) : []);
  if (alleles.length === 0) return "normal_metabolizer";
  return resolveCypPhenotype(variant.gene, alleles);
}

/** True if an HLA variant indicates carriage of a named risk allele. */
function carriesHlaAllele(variant: PgxVariant, riskAllele: string): boolean {
  if (variant.gene.toUpperCase() !== "HLA-B") return false;
  if (variant.phenotype === "positive") {
    // explicit positive call — trust it if the diplotype names the allele or
    // no diplotype detail was provided.
    if (!variant.diplotype && !variant.alleles) return true;
  }
  const tokens = [
    variant.diplotype ?? "",
    ...(variant.alleles ?? []),
  ]
    .join(" ")
    .replace(/\*/g, "")
    .toLowerCase();
  return (
    tokens.includes(riskAllele.replace(/\*/g, "").toLowerCase()) &&
    variant.phenotype !== "negative"
  );
}

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

interface PgxRule {
  ruleId: string;
  drug: { rxNormCuis?: string[]; names: string[] };
  /** Gene this rule keys on. */
  gene: string;
  /**
   * Returns a finding when the variant triggers, else null. Receives the
   * resolved phenotype and the raw variant (for HLA allele inspection).
   */
  evaluate: (
    phenotype: PgxPhenotype,
    variant: PgxVariant
  ) => Omit<GuardrailFinding, "layer" | "ruleId"> | null;
}

const PGX_RULES: PgxRule[] = [
  // --- Clopidogrel × CYP2C19 IM/PM → hard_substitution -------------------
  {
    ruleId: "pgx.clopidogrel.cyp2c19",
    drug: { rxNormCuis: ["32968"], names: ["clopidogrel", "plavix"] },
    gene: "CYP2C19",
    evaluate(phenotype) {
      if (
        phenotype === "poor_metabolizer" ||
        phenotype === "intermediate_metabolizer"
      ) {
        return {
          kind: "hard_substitution",
          mechanism:
            "CYP2C19 loss-of-function reduces conversion of the clopidogrel " +
            "pro-drug to its active thiol metabolite.",
          rationale: `Patient is a CYP2C19 ${phenotype.replace("_", " ")}; ` +
            "diminished antiplatelet effect raises the risk of major adverse " +
            "cardiovascular events.",
          recommendation:
            "Block clopidogrel. Substitute an antiplatelet unaffected by " +
            "CYP2C19 polymorphism, e.g. prasugrel or ticagrelor.",
          citations: ["CPIC Level A", "CPIC clopidogrel/CYP2C19 guideline"],
          details: { gene: "CYP2C19", phenotype },
        };
      }
      return null;
    },
  },

  // --- Codeine/Tramadol × CYP2D6 PM → dosing_override --------------------
  {
    ruleId: "pgx.opioid.cyp2d6.pm",
    drug: {
      names: ["codeine", "tramadol", "ultram", "conzip"],
    },
    gene: "CYP2D6",
    evaluate(phenotype) {
      if (phenotype === "poor_metabolizer") {
        return {
          kind: "dosing_override",
          mechanism:
            "CYP2D6 poor metabolizers cannot O-demethylate codeine to " +
            "morphine (or tramadol to its active O-desmethyl metabolite).",
          rationale:
            "Expected complete therapeutic failure — no analgesic efficacy " +
            "at any dose.",
          recommendation:
            "Avoid codeine/tramadol. Select a non-opioid analgesic or an " +
            "opioid not dependent on CYP2D6 activation.",
          citations: ["CPIC Level A", "CPIC codeine/CYP2D6 guideline"],
          details: { gene: "CYP2D6", phenotype },
        };
      }
      return null;
    },
  },

  // --- Codeine/Tramadol × CYP2D6 ultrarapid → hard_stop ------------------
  {
    ruleId: "pgx.opioid.cyp2d6.um",
    drug: {
      names: ["codeine", "tramadol", "ultram", "conzip"],
    },
    gene: "CYP2D6",
    evaluate(phenotype) {
      if (phenotype === "ultrarapid_metabolizer") {
        return {
          kind: "hard_stop",
          mechanism:
            "CYP2D6 ultra-rapid metabolizers convert codeine/tramadol to " +
            "morphine far faster than normal, producing toxic opioid levels " +
            "at standard doses.",
          rationale:
            "High risk of severe, life-threatening opioid toxicity including " +
            "respiratory depression.",
          recommendation:
            "Cancel the order. Do not prescribe codeine or tramadol. Log a " +
            "critical respiratory safety warning and choose a non-CYP2D6 " +
            "analgesic.",
          citations: ["CPIC Level A", "CPIC codeine/CYP2D6 guideline"],
          details: {
            gene: "CYP2D6",
            phenotype,
            criticalRespiratoryWarning: true,
          },
        };
      }
      return null;
    },
  },

  // --- Allopurinol × HLA-B*58:01 → hard_stop -----------------------------
  {
    ruleId: "pgx.allopurinol.hlab5801",
    drug: { rxNormCuis: ["519"], names: ["allopurinol", "zyloprim", "aloprim"] },
    gene: "HLA-B",
    evaluate(_phenotype, variant) {
      if (carriesHlaAllele(variant, "*58:01")) {
        return {
          kind: "hard_stop",
          mechanism:
            "HLA-B*58:01 carriage is strongly associated with allopurinol " +
            "hypersensitivity, including Stevens-Johnson Syndrome / Toxic " +
            "Epidermal Necrolysis (SJS/TEN).",
          rationale:
            "Patient carries HLA-B*58:01 — high risk of a potentially fatal " +
            "severe cutaneous adverse reaction.",
          recommendation:
            "Hard stop. Do not prescribe allopurinol. Select an alternative " +
            "urate-lowering agent such as febuxostat.",
          citations: ["CPIC Level A", "CPIC allopurinol/HLA-B guideline"],
          details: { gene: "HLA-B", riskAllele: "*58:01" },
        };
      }
      return null;
    },
  },
];

/**
 * Evaluate the PGx layer for a draft order against the patient's variants.
 * Returns an empty array (silent pass) when there is no genomic data for the
 * relevant gene — absence of data is never surfaced as a warning.
 */
export function evaluatePgx(
  order: DraftOrder,
  variants: PgxVariant[]
): GuardrailFinding[] {
  if (!variants || variants.length === 0) return [];
  const findings: GuardrailFinding[] = [];

  for (const rule of PGX_RULES) {
    if (!orderMatchesDrug(order, rule.drug)) continue;

    const relevant = variants.filter(
      (v) => v.gene.toUpperCase() === rule.gene.toUpperCase()
    );
    // No genomic data on file for this gene → silent pass for this rule.
    if (relevant.length === 0) continue;

    for (const variant of relevant) {
      const phenotype = phenotypeFor(variant);
      const partial = rule.evaluate(phenotype, variant);
      if (partial) {
        findings.push({ ...partial, layer: "pgx", ruleId: rule.ruleId });
      }
    }
  }

  return findings;
}
