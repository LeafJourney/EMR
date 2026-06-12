// ---------------------------------------------------------------------------
// Organ Function Clearance Calculations & Adaptive Dosing — Phase 3.
//
// Pure calculators (no I/O) with published test vectors covered in __tests__:
//   - CKD-EPI 2021 creatinine eGFR
//   - Child-Pugh score / class from bilirubin, albumin, INR (+ optional
//     ascites / encephalopathy clinical flags, default absent)
//   - Dose-cap recommendations driven by Child-Pugh class and eGFR bands.
//
// Labs older than 180 days are NOT silently used: findings derived from stale
// labs are marked lowConfidence:true so the UI can badge them.
// ---------------------------------------------------------------------------

import {
  type DraftOrder,
  type GuardrailFinding,
  type LabResult,
  type PatientRxProfile,
  LAB_FRESHNESS_WINDOW_DAYS,
  LOINC,
  orderMatchesDrug,
} from "./types";

// ---------------------------------------------------------------------------
// CKD-EPI 2021 creatinine eGFR
// ---------------------------------------------------------------------------

/**
 * CKD-EPI 2021 creatinine equation (race-free):
 *   eGFR = 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^−1.200 × 0.9938^age × (1.012 if female)
 * where κ = 0.7 (F) / 0.9 (M), α = −0.241 (F) / −0.302 (M).
 *
 * @param scr serum creatinine in mg/dL
 * @param age years
 * @param sex "female" | "male"
 * @returns eGFR in mL/min/1.73m²
 */
export function ckdEpi2021(
  scr: number,
  age: number,
  sex: "female" | "male"
): number {
  const female = sex === "female";
  const kappa = female ? 0.7 : 0.9;
  const alpha = female ? -0.241 : -0.302;
  const ratio = scr / kappa;
  let egfr =
    142 *
    Math.pow(Math.min(ratio, 1), alpha) *
    Math.pow(Math.max(ratio, 1), -1.2) *
    Math.pow(0.9938, age);
  if (female) egfr *= 1.012;
  return egfr;
}

/** Standard KDIGO eGFR band for a value (G1–G5). */
export type EgfrBand = "G1" | "G2" | "G3a" | "G3b" | "G4" | "G5";

export function egfrBand(egfr: number): EgfrBand {
  if (egfr >= 90) return "G1";
  if (egfr >= 60) return "G2";
  if (egfr >= 45) return "G3a";
  if (egfr >= 30) return "G3b";
  if (egfr >= 15) return "G4";
  return "G5";
}

// ---------------------------------------------------------------------------
// Child-Pugh score / class
// ---------------------------------------------------------------------------

export type ChildPughClass = "A" | "B" | "C";

export interface ChildPughInput {
  /** Total bilirubin, mg/dL. */
  bilirubin: number;
  /** Serum albumin, g/dL. */
  albumin: number;
  /** INR (unitless). */
  inr: number;
  /** Ascites clinical flag (default absent). */
  ascites?: "absent" | "slight" | "moderate";
  /** Hepatic encephalopathy grade 0–4 (default 0 / none). */
  encephalopathyGrade?: 0 | 1 | 2 | 3 | 4;
}

export interface ChildPughResult {
  score: number;
  class: ChildPughClass;
  /** Per-parameter points, for transparency in the UI. */
  breakdown: {
    bilirubin: number;
    albumin: number;
    inr: number;
    ascites: number;
    encephalopathy: number;
  };
}

function bilirubinPoints(b: number): number {
  if (b < 2) return 1;
  if (b <= 3) return 2;
  return 3;
}
function albuminPoints(a: number): number {
  if (a > 3.5) return 1;
  if (a >= 2.8) return 2;
  return 3;
}
function inrPoints(inr: number): number {
  if (inr < 1.7) return 1;
  if (inr <= 2.3) return 2;
  return 3;
}
function ascitesPoints(a: ChildPughInput["ascites"]): number {
  switch (a) {
    case "moderate":
      return 3;
    case "slight":
      return 2;
    default:
      return 1; // absent
  }
}
function encephalopathyPoints(grade: number): number {
  if (grade >= 3) return 3;
  if (grade >= 1) return 2;
  return 1; // none
}

/** Compute the Child-Pugh score and class. */
export function childPugh(input: ChildPughInput): ChildPughResult {
  const breakdown = {
    bilirubin: bilirubinPoints(input.bilirubin),
    albumin: albuminPoints(input.albumin),
    inr: inrPoints(input.inr),
    ascites: ascitesPoints(input.ascites),
    encephalopathy: encephalopathyPoints(input.encephalopathyGrade ?? 0),
  };
  const score =
    breakdown.bilirubin +
    breakdown.albumin +
    breakdown.inr +
    breakdown.ascites +
    breakdown.encephalopathy;
  const cls: ChildPughClass = score <= 6 ? "A" : score <= 9 ? "B" : "C";
  return { score, class: cls, breakdown };
}

// ---------------------------------------------------------------------------
// Lab freshness helpers
// ---------------------------------------------------------------------------

function ageInDays(observedAt: string | Date, now: Date): number {
  const t = observedAt instanceof Date ? observedAt : new Date(observedAt);
  return (now.getTime() - t.getTime()) / (1000 * 60 * 60 * 24);
}

/** Most-recent lab for a LOINC, or undefined. */
function latestLab(labs: LabResult[], loinc: string): LabResult | undefined {
  return labs
    .filter((l) => l.loinc === loinc)
    .sort(
      (a, b) =>
        new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime()
    )[0];
}

// ---------------------------------------------------------------------------
// Hepatotoxic / renally-cleared agent tables (anchor set)
// ---------------------------------------------------------------------------

/** High-clearance hepatotoxic agents the engine caps under Child-Pugh C. */
const HEPATOTOXIC_AGENTS: Array<{
  names: string[];
  rxNormCuis?: string[];
  /** Max total daily dose (mg) recommended in Child-Pugh C, if defined. */
  childPughCDailyCapMg?: number;
  note: string;
}> = [
  {
    names: ["acetaminophen", "tylenol", "paracetamol", "apap"],
    childPughCDailyCapMg: 2000,
    note: "Cap acetaminophen at ≤2 g/day in advanced cirrhosis.",
  },
  {
    names: ["valproic acid", "valproate", "depakote", "depakene", "divalproex"],
    note:
      "Valproic acid is hepatotoxic and can precipitate hyperammonemic " +
      "encephalopathy in hepatic impairment — avoid or use extreme caution.",
  },
];

/** Renally-cleared agents that need eGFR-band dose adjustment flags. */
const RENALLY_CLEARED_AGENTS: Array<{
  names: string[];
  rxNormCuis?: string[];
  note: string;
}> = [
  {
    names: ["gabapentin", "neurontin"],
    note: "Gabapentin is renally eliminated — reduce dose as eGFR falls.",
  },
  {
    names: ["metformin", "glucophage", "fortamet", "glumetza"],
    note:
      "Metformin: review dose below eGFR 45; contraindicated below eGFR 30 " +
      "(lactic acidosis risk).",
  },
  {
    names: ["allopurinol", "zyloprim", "aloprim"],
    note: "Allopurinol maintenance dose should be reduced in renal impairment.",
  },
];

// ---------------------------------------------------------------------------
// evaluateOrgan — Phase 3 adaptive dosing findings
// ---------------------------------------------------------------------------

/**
 * Evaluate renal + hepatic clearance for the draft order. Pure aside from a
 * `now` clock injected for deterministic freshness testing.
 */
export function evaluateOrgan(
  order: DraftOrder,
  profile: PatientRxProfile,
  now: Date = new Date()
): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];

  // --- Renal: CKD-EPI 2021 → band-based adjustment flags -----------------
  const creat = latestLab(profile.labs, LOINC.SERUM_CREATININE);
  if (creat) {
    const renalAgent = RENALLY_CLEARED_AGENTS.find((a) =>
      orderMatchesDrug(order, { names: a.names, rxNormCuis: a.rxNormCuis })
    );
    if (renalAgent) {
      const egfr = ckdEpi2021(creat.value, profile.age, profile.sex);
      const band = egfrBand(egfr);
      const stale = ageInDays(creat.observedAt, now) > LAB_FRESHNESS_WINDOW_DAYS;
      // Only flag when filtration is actually reduced (band G3a or worse).
      if (band !== "G1" && band !== "G2") {
        findings.push({
          kind: "dosing_override",
          layer: "organ",
          ruleId: "organ.renal.dose_adjust",
          mechanism:
            "Reduced glomerular filtration slows clearance of renally-" +
            "eliminated drugs, risking accumulation and toxicity.",
          rationale:
            `eGFR ${egfr.toFixed(0)} mL/min/1.73m² (KDIGO ${band}). ` +
            renalAgent.note,
          recommendation:
            "Apply renal dose adjustment for the reduced eGFR band before " +
            "signing.",
          citations: [
            "CKD-EPI 2021",
            `creatinine ${creat.value} mg/dL drawn ${formatDate(creat.observedAt)}`,
          ],
          lowConfidence: stale || undefined,
          details: {
            egfr: Number(egfr.toFixed(1)),
            egfrBand: band,
            creatinineMgDl: creat.value,
            labDate: formatDate(creat.observedAt),
          },
        });
      }
    }
  }

  // --- Hepatic: Child-Pugh → dose caps / alternatives --------------------
  const bili = latestLab(profile.labs, LOINC.TOTAL_BILIRUBIN);
  const alb = latestLab(profile.labs, LOINC.ALBUMIN);
  const inr = latestLab(profile.labs, LOINC.INR);
  if (bili && alb && inr) {
    const cp = childPugh({
      bilirubin: bili.value,
      albumin: alb.value,
      inr: inr.value,
      ascites: profile.ascites,
      encephalopathyGrade: profile.encephalopathyGrade,
    });
    if (cp.class === "C") {
      const hepAgent = HEPATOTOXIC_AGENTS.find((a) =>
        orderMatchesDrug(order, { names: a.names, rxNormCuis: a.rxNormCuis })
      );
      if (hepAgent) {
        const stale =
          [bili, alb, inr].some(
            (l) => ageInDays(l.observedAt, now) > LAB_FRESHNESS_WINDOW_DAYS
          ) || undefined;
        const capped =
          hepAgent.childPughCDailyCapMg != null &&
          order.dailyDoseMg != null &&
          order.dailyDoseMg > hepAgent.childPughCDailyCapMg;
        findings.push({
          kind: "dosing_override",
          layer: "organ",
          ruleId: "organ.hepatic.dose_cap",
          mechanism:
            "Child-Pugh C cirrhosis sharply reduces hepatic clearance of " +
            "high-extraction hepatotoxic molecules.",
          rationale:
            `Child-Pugh class C (score ${cp.score}). ${hepAgent.note}` +
            (capped
              ? ` Drafted ${order.dailyDoseMg} mg/day exceeds the ` +
                `${hepAgent.childPughCDailyCapMg} mg/day cap.`
              : ""),
          recommendation:
            hepAgent.childPughCDailyCapMg != null
              ? `Cap total daily dose at ≤${hepAgent.childPughCDailyCapMg} mg, ` +
                "or transition to an agent with renal-dominant elimination."
              : "Avoid or transition to an agent with renal-dominant " +
                "elimination given Child-Pugh C status.",
          citations: [
            "Child-Pugh classification",
            `bilirubin/albumin/INR drawn ${formatDate(bili.observedAt)}`,
          ],
          lowConfidence: stale,
          details: {
            childPughClass: cp.class,
            childPughScore: cp.score,
            dailyDoseMg: order.dailyDoseMg ?? null,
            exceedsCap: capped,
          },
        });
      }
    }
  }

  return findings;
}

function formatDate(d: string | Date): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}
