// EMR-757 — Bolster Med Mix analysis with OTC, physical exam, and
// history sources.
//
// SAFE: dead-export-allowed reason="Clinical helper function for Med Mix analysis (will be imported by upcoming pages)"
//
// The legacy Drug Interaction Checker (src/lib/domain/drug-interactions.ts)
// looks at prescription medications + cannabinoids only. The Med Mix
// surface needs richer signal:
//   - Over-the-counter medications & supplements (the things patients
//     forget to mention).
//   - Physical exam findings (e.g. elevated BP, weight, age) that change
//     the recommendation around a given interaction.
//   - Active conditions / history (e.g. bleeding disorder, hepatic
//     impairment) that amplify or trigger interactions.
//
// We do NOT invent clinical details. The analyzer only flags signals that
// are explicitly present in the inputs. Every output finding carries a
// `sources` array citing which input it came from so the UI can display
// "Because you take warfarin AND you logged ibuprofen as OTC..." rather
// than a black-box recommendation.

import {
  checkInteractions,
  type DrugInteraction,
  type Severity,
} from "./drug-interactions";

export type MedMixSource =
  | "prescription"
  | "otc"
  | "history"
  | "exam"
  | "cannabis";

export interface MedMixMedication {
  /** Free-text medication name as the patient/provider supplied it. */
  name: string;
  source: "prescription" | "otc";
}

export interface MedMixHistoryItem {
  /** Free-text label, e.g. "atrial fibrillation", "cirrhosis". */
  label: string;
  /** Optional ICD-10 code if we have one. Used for stable matching. */
  icd10?: string;
}

export interface MedMixExamFinding {
  /** What was measured: "bp_systolic", "weight_kg", "heart_rate", etc. */
  metric: string;
  value: number;
  /** Unit string for display. */
  unit: string;
}

export interface MedMixAnalysisInput {
  /** Prescription + OTC medications. OTC tagged separately for the UI. */
  medications: MedMixMedication[];
  /** Cannabinoids the patient is using (THC, CBD, CBN, etc.). */
  cannabinoids: string[];
  /** Active conditions + relevant history. */
  history?: MedMixHistoryItem[];
  /** Recent objective findings (vitals, labs we trust on the input). */
  exam?: MedMixExamFinding[];
}

export interface MedMixFinding {
  /**
   * The underlying drug interaction (drug + cannabinoid). The Med Mix
   * analyzer enriches this with extra context but never overrides the
   * canonical mechanism/recommendation strings.
   */
  interaction: DrugInteraction;
  /**
   * Adjusted severity after applying the history/exam amplifiers. May
   * equal the underlying interaction severity (most cases).
   */
  adjustedSeverity: Severity;
  /**
   * Source attribution so the UI can show "this was flagged because you
   * told us X". Empty if the bare interaction is the only signal.
   */
  sources: MedMixSource[];
  /**
   * Human-readable amplifying notes (e.g. "Bleeding-risk diagnosis on
   * record."). Always derived from one of the inputs — never invented.
   */
  amplifiers: string[];
}

export interface MedMixAnalysis {
  findings: MedMixFinding[];
  /**
   * Inputs the analyzer did NOT have access to. The UI uses these as
   * follow-up prompts ("Add a recent BP reading for a better check?").
   */
  missing: Array<"otc" | "history" | "exam" | "cannabis">;
}

const AMPLIFIER_KEYWORDS_BLEEDING = [
  "atrial fibrillation",
  "deep vein thrombosis",
  "dvt",
  "pulmonary embolism",
  "anticoagul",
  "hemophilia",
  "thrombocytopenia",
  "bleeding disorder",
];

const AMPLIFIER_KEYWORDS_HEPATIC = [
  "cirrhosis",
  "hepatic impairment",
  "liver disease",
  "hepatitis",
];

const AMPLIFIER_KEYWORDS_CARDIO = [
  "hypertension",
  "coronary artery disease",
  "heart failure",
  "cad",
];

function bumpSeverity(current: Severity): Severity {
  if (current === "green") return "yellow";
  if (current === "yellow") return "red";
  return "red";
}

function matchesAny(haystack: string, needles: readonly string[]): boolean {
  const hay = haystack.toLowerCase();
  return needles.some((n) => hay.includes(n));
}

function historyMatches(
  history: MedMixHistoryItem[],
  needles: readonly string[],
): boolean {
  return history.some((h) => matchesAny(h.label, needles));
}

/**
 * Top-level entry point. Pure / synchronous so it can run in either the
 * server prompt for the Med Mix agent or the client preview component.
 */
export function analyzeMedMix(input: MedMixAnalysisInput): MedMixAnalysis {
  const prescriptionNames = input.medications
    .filter((m) => m.source === "prescription")
    .map((m) => m.name);
  const otcNames = input.medications
    .filter((m) => m.source === "otc")
    .map((m) => m.name);
  const allMedNames = [...prescriptionNames, ...otcNames];
  const history = input.history ?? [];
  const exam = input.exam ?? [];

  const baseInteractions = checkInteractions(allMedNames, input.cannabinoids);

  const findings: MedMixFinding[] = baseInteractions.map((interaction) => {
    const sources: MedMixSource[] = ["cannabis"];
    const amplifiers: string[] = [];
    let severity = interaction.severity;

    // Tag the source side of the interaction (Rx vs OTC).
    const matchedRx = prescriptionNames.some((n) =>
      n.toLowerCase().includes(interaction.drug.toLowerCase()),
    );
    const matchedOtc = otcNames.some((n) =>
      n.toLowerCase().includes(interaction.drug.toLowerCase()),
    );
    if (matchedRx) sources.push("prescription");
    if (matchedOtc) sources.push("otc");

    // Bleeding-risk amplifier: warfarin/aspirin-like + bleeding history.
    if (
      /warfarin|coumadin|apixaban|rivaroxaban|aspirin|ibuprofen|naproxen/i.test(
        interaction.drug,
      ) &&
      historyMatches(history, AMPLIFIER_KEYWORDS_BLEEDING)
    ) {
      severity = bumpSeverity(severity);
      sources.push("history");
      amplifiers.push("Bleeding-risk condition on record.");
    }

    // Hepatic amplifier: anything CYP-metabolized + hepatic history.
    if (
      /metoprolol|warfarin|clopidogrel|sertraline|amitriptyline|tramadol|codeine/i.test(
        interaction.drug,
      ) &&
      historyMatches(history, AMPLIFIER_KEYWORDS_HEPATIC)
    ) {
      severity = bumpSeverity(severity);
      sources.push("history");
      amplifiers.push("Hepatic impairment on record amplifies CYP load.");
    }

    // Cardiovascular amplifier: heart-rate / BP exam findings + cardio Rx.
    if (
      /metoprolol|propranolol|amlodipine|lisinopril|atenolol/i.test(
        interaction.drug,
      )
    ) {
      const bpSystolic = exam.find((e) => e.metric === "bp_systolic")?.value;
      if (
        bpSystolic != null &&
        (bpSystolic >= 160 || bpSystolic <= 90) &&
        historyMatches(history, AMPLIFIER_KEYWORDS_CARDIO)
      ) {
        severity = bumpSeverity(severity);
        sources.push("exam");
        sources.push("history");
        amplifiers.push(
          `Recent systolic BP ${bpSystolic} mmHg + cardiovascular history.`,
        );
      }
    }

    return {
      interaction,
      adjustedSeverity: severity,
      sources: Array.from(new Set(sources)),
      amplifiers,
    };
  });

  // Re-sort with adjusted severity so red-bumps float to the top.
  const order: Record<Severity, number> = { red: 0, yellow: 1, green: 2 };
  findings.sort(
    (a, b) => order[a.adjustedSeverity] - order[b.adjustedSeverity],
  );

  const missing: MedMixAnalysis["missing"] = [];
  if (otcNames.length === 0) missing.push("otc");
  if (history.length === 0) missing.push("history");
  if (exam.length === 0) missing.push("exam");
  if (input.cannabinoids.length === 0) missing.push("cannabis");

  return { findings, missing };
}
