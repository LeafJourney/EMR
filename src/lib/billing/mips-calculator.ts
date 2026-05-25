/**
 * MIPS (Merit-based Incentive Payment System) Calculator — EMR-042
 *
 * Two layers:
 *
 *   1. `MipsCalculator` (legacy) — pure weighted-average score from
 *      already-computed category inputs. Preserved for any caller that just
 *      wants the final-score → adjustment math.
 *
 *   2. `evaluateMips()` (new) — quality-measure extrapolation. Walks patient
 *      encounter records, SOAP notes, and messages to evaluate performance on
 *      the four cannabis-clinic-relevant CMS quality measures and rolls the
 *      result up into a full MIPS projection (quality points, weighted
 *      category, final score, payment adjustment, action items).
 *
 * Measure references are CMS eCQM IDs current as of the CY2024 reporting
 * year. Benchmarks are CMS published decile-10 thresholds (the rate at which
 * a measure earns the full 10 quality points); below the floor a measure
 * earns the 3-point participation floor.
 */

// ---------------------------------------------------------------------------
// Legacy weighted-score API (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface MipsData {
  qualityScore: number; // 0-100
  promotingInteroperability: number; // 0-100
  improvementActivities: number; // 0-40
  costScore: number; // 0-100
}

export interface MipsResult {
  finalScore: number;
  paymentAdjustmentPercent: number;
  isPenalty: boolean;
  isExceptional: boolean;
}

export class MipsCalculator {
  private readonly weights = {
    quality: 0.30,
    pi: 0.25,
    ia: 0.15,
    cost: 0.30,
  };

  private readonly penaltyThreshold = 75;
  private readonly exceptionalThreshold = 89;

  calculateAdjustment(data: MipsData): MipsResult {
    const qualityWeighted = data.qualityScore * this.weights.quality;
    const piWeighted = data.promotingInteroperability * this.weights.pi;
    const iaWeighted = (data.improvementActivities / 40) * 100 * this.weights.ia;
    const costWeighted = data.costScore * this.weights.cost;

    const finalScore =
      Math.round((qualityWeighted + piWeighted + iaWeighted + costWeighted) * 100) /
      100;

    let adjustment = 0;
    let isPenalty = false;
    let isExceptional = false;

    if (finalScore < this.penaltyThreshold) {
      adjustment = -9.0 * ((this.penaltyThreshold - finalScore) / this.penaltyThreshold);
      isPenalty = true;
    } else {
      adjustment = 9.0 * ((finalScore - this.penaltyThreshold) / (100 - this.penaltyThreshold));
      if (finalScore >= this.exceptionalThreshold) {
        isExceptional = true;
        adjustment += 1.5;
      }
    }

    return {
      finalScore,
      paymentAdjustmentPercent: Number(adjustment.toFixed(2)),
      isPenalty,
      isExceptional,
    };
  }
}

export const mipsCalculator = new MipsCalculator();

// ---------------------------------------------------------------------------
// Quality measure extrapolation
// ---------------------------------------------------------------------------

export type MeasureId = "Q134" | "Q138" | "Q236" | "Q130";
export type MeasureStatus = "met" | "not_met" | "excluded";

export interface PatientRecord {
  id: string;
  age: number;
  displayName?: string;
  /** ICD-10 (or condition string) flags relevant to denominator/exclusion. */
  conditions?: string[];
  flags?: {
    hospice?: boolean;
    activeDepression?: boolean;
    bipolar?: boolean;
    pregnancy?: boolean;
    limitedLifeExpectancy?: boolean;
  };
  /** Discharge events count for Q130 denominator. */
  postDischargeWindows?: number;
}

export interface EncounterRecord {
  id: string;
  patientId: string;
  providerId?: string;
  date: string;
  /** "office_visit" | "telehealth" | "follow_up" | "discharge" | ... */
  type?: string;
  systolic?: number;
  diastolic?: number;
}

export interface SoapNoteRecord {
  id: string;
  patientId: string;
  encounterId?: string;
  date: string;
  content: string;
  /** Optional structured findings; when present override regex sniffing. */
  depressionScreening?: { performed: boolean; positive?: boolean; followUpPlanned?: boolean };
  tobaccoScreening?: { performed: boolean; user?: boolean; cessationOffered?: boolean };
  medicationReconciliation?: { performed: boolean };
}

export interface MessageRecord {
  id: string;
  patientId: string;
  date: string;
  body: string;
  direction?: "in" | "out";
}

export interface PatientDataset {
  patient: PatientRecord;
  encounters: EncounterRecord[];
  notes: SoapNoteRecord[];
  messages: MessageRecord[];
}

export interface PatientMeasureResult {
  measureId: MeasureId;
  patientId: string;
  patientDisplay?: string;
  status: MeasureStatus;
  reason: string;
}

export interface MeasureSummary {
  id: MeasureId;
  /** CMS eCQM identifier (e.g. "CMS2v12"). */
  cmsId: string;
  title: string;
  shortName: string;
  domain: "Preventive Care" | "Chronic Care" | "Care Coordination" | "Safety";
  description: string;
  denominator: number;
  numerator: number;
  exclusions: number;
  /** Performance rate — numerator / (denominator − exclusions), 0..100. */
  performanceRate: number;
  /** CMS decile-10 benchmark threshold for full 10 quality points. */
  benchmark: number;
  /** Earned quality points (3-point floor for reported measures, up to 10). */
  qualityPoints: number;
  perPatient: PatientMeasureResult[];
}

export interface QualityCategoryResult {
  measures: MeasureSummary[];
  /** Sum of `qualityPoints`. */
  totalEarned: number;
  /** 10 × number of reported measures. */
  totalAvailable: number;
  /** earned / available × 100. */
  categoryScore: number;
}

export interface MipsCategoryInputs {
  /** Promoting Interoperability raw score, 0-100. Defaults to 75. */
  promotingInteroperability?: number;
  /** Improvement Activities raw points, 0-40. Defaults to 30. */
  improvementActivities?: number;
  /** Cost category raw score, 0-100. Defaults to 78. */
  costScore?: number;
}

export interface ActionItem {
  measureId: MeasureId;
  title: string;
  priority: "high" | "medium" | "low";
  /** Patients that would move the needle if closed. */
  gap: number;
  impact: string;
}

export interface MipsEvaluation {
  generatedAt: string;
  reportingPeriod: { start: string; end: string };
  patientCount: number;
  quality: QualityCategoryResult;
  categories: {
    quality: { weight: number; raw: number; weighted: number };
    pi: { weight: number; raw: number; weighted: number };
    ia: { weight: number; raw: number; weighted: number };
    cost: { weight: number; raw: number; weighted: number };
  };
  finalScore: number;
  paymentAdjustmentPercent: number;
  isPenalty: boolean;
  isExceptional: boolean;
  actionItems: ActionItem[];
}

// ---------------------------------------------------------------------------
// Measure metadata
// ---------------------------------------------------------------------------

interface MeasureMeta {
  id: MeasureId;
  cmsId: string;
  title: string;
  shortName: string;
  domain: MeasureSummary["domain"];
  description: string;
  /** CMS decile-10 benchmark (full 10 points at or above this rate). */
  benchmark: number;
}

const MEASURES: Record<MeasureId, MeasureMeta> = {
  Q134: {
    id: "Q134",
    cmsId: "CMS2v12",
    title: "Preventive Care & Screening: Screening for Depression and Follow-Up Plan",
    shortName: "Depression Screening",
    domain: "Preventive Care",
    description:
      "Patients aged 12+ screened for clinical depression with an age-appropriate standardized tool; if positive, a follow-up plan is documented on the date of the positive screen.",
    benchmark: 80,
  },
  Q138: {
    id: "Q138",
    cmsId: "CMS138v12",
    title: "Preventive Care & Screening: Tobacco Use & Cessation Intervention",
    shortName: "Tobacco Screening",
    domain: "Preventive Care",
    description:
      "Patients aged 12+ screened for tobacco use at least once within 24 months; identified users received cessation counseling or pharmacotherapy.",
    benchmark: 85,
  },
  Q236: {
    id: "Q236",
    cmsId: "CMS165v12",
    title: "Controlling High Blood Pressure",
    shortName: "Hypertension Control",
    domain: "Chronic Care",
    description:
      "Patients 18-85 with diagnosed hypertension whose most recent blood pressure during the reporting period was adequately controlled (<140/90 mm Hg).",
    benchmark: 75,
  },
  Q130: {
    id: "Q130",
    cmsId: "CMS156v12",
    title: "Medication Reconciliation Post-Discharge",
    shortName: "Medication Reconciliation",
    domain: "Care Coordination",
    description:
      "Discharges from inpatient/ED for which medications were reconciled by an eligible clinician within 30 days, documented in the chart.",
    benchmark: 90,
  },
};

// ---------------------------------------------------------------------------
// Detection helpers — when structured fields aren't provided, sniff free text
// ---------------------------------------------------------------------------

const PHQ_RX = /\b(phq[\s-]?(?:2|9)|patient health questionnaire|depression screen(?:ing)?|beck depression|edinburgh)\b/i;
const PHQ_POSITIVE_RX = /\b(positive(?: screen)?|elevated|score(?:d)? (?:1[0-9]|[3-9])|moderate|severe)\b/i;
const FOLLOWUP_RX = /\b(follow[-\s]?up|safety plan|referr(?:al|ed) to (?:therap|psych|behavioral)|crisis plan)\b/i;

const TOBACCO_RX = /\b(tobacco|smoking|smoker|nicotine|vap(?:ing|e)|cigarette|chew(?:ing tobacco)?)\b/i;
const TOBACCO_USER_RX = /\b(current (?:smoker|tobacco user)|smokes \d+|pack[-\s]?per[-\s]?day|active tobacco|daily smoker)\b/i;
const CESSATION_RX = /\b(cessation|quitline|quit(?:\s?date)?|nrt|nicotine replacement|varenicline|bupropion)\b/i;

const MED_REC_RX = /\b(med(?:ication)?[\s-]?rec(?:onciliation|onciled)?|reconcil(?:ed|iation) medications?|post[-\s]?discharge med)\b/i;

function findDepression(notes: SoapNoteRecord[], messages: MessageRecord[]): {
  performed: boolean;
  positive: boolean;
  followUp: boolean;
} {
  let performed = false;
  let positive = false;
  let followUp = false;

  for (const n of notes) {
    if (n.depressionScreening?.performed) {
      performed = true;
      if (n.depressionScreening.positive) positive = true;
      if (n.depressionScreening.followUpPlanned) followUp = true;
      continue;
    }
    if (PHQ_RX.test(n.content)) {
      performed = true;
      if (PHQ_POSITIVE_RX.test(n.content)) positive = true;
      if (FOLLOWUP_RX.test(n.content)) followUp = true;
    }
  }

  if (!performed) {
    for (const m of messages) {
      if (PHQ_RX.test(m.body)) {
        performed = true;
        if (PHQ_POSITIVE_RX.test(m.body)) positive = true;
        if (FOLLOWUP_RX.test(m.body)) followUp = true;
        break;
      }
    }
  }

  return { performed, positive, followUp };
}

function findTobacco(notes: SoapNoteRecord[], messages: MessageRecord[]): {
  performed: boolean;
  user: boolean;
  cessationOffered: boolean;
} {
  let performed = false;
  let user = false;
  let cessationOffered = false;

  for (const n of notes) {
    if (n.tobaccoScreening?.performed) {
      performed = true;
      if (n.tobaccoScreening.user) user = true;
      if (n.tobaccoScreening.cessationOffered) cessationOffered = true;
      continue;
    }
    if (TOBACCO_RX.test(n.content)) {
      performed = true;
      if (TOBACCO_USER_RX.test(n.content)) user = true;
      if (CESSATION_RX.test(n.content)) cessationOffered = true;
    }
  }

  if (!performed) {
    for (const m of messages) {
      if (TOBACCO_RX.test(m.body)) {
        performed = true;
        if (TOBACCO_USER_RX.test(m.body)) user = true;
        if (CESSATION_RX.test(m.body)) cessationOffered = true;
        break;
      }
    }
  }

  return { performed, user, cessationOffered };
}

function findMedRec(notes: SoapNoteRecord[], messages: MessageRecord[]): boolean {
  for (const n of notes) {
    if (n.medicationReconciliation?.performed) return true;
    if (MED_REC_RX.test(n.content)) return true;
  }
  for (const m of messages) {
    if (MED_REC_RX.test(m.body)) return true;
  }
  return false;
}

function hasCondition(p: PatientRecord, ...needles: string[]): boolean {
  const conds = (p.conditions ?? []).map((c) => c.toLowerCase());
  return needles.some((n) => conds.some((c) => c.includes(n.toLowerCase())));
}

function mostRecentBp(encounters: EncounterRecord[]): { sys: number; dia: number } | null {
  const withBp = encounters
    .filter((e) => typeof e.systolic === "number" && typeof e.diastolic === "number")
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
  if (withBp.length === 0) return null;
  return { sys: withBp[0].systolic!, dia: withBp[0].diastolic! };
}

// ---------------------------------------------------------------------------
// Per-measure evaluation
// ---------------------------------------------------------------------------

function evalDepression(d: PatientDataset): PatientMeasureResult | null {
  const { patient, notes, messages } = d;
  const display = patient.displayName ?? patient.id;
  if (patient.age < 12) return null;

  if (patient.flags?.activeDepression || patient.flags?.bipolar) {
    return {
      measureId: "Q134",
      patientId: patient.id,
      patientDisplay: display,
      status: "excluded",
      reason: "Active depression or bipolar diagnosis — excluded per CMS2.",
    };
  }

  const { performed, positive, followUp } = findDepression(notes, messages);

  if (!performed) {
    return {
      measureId: "Q134",
      patientId: patient.id,
      patientDisplay: display,
      status: "not_met",
      reason: "No PHQ-2/PHQ-9 documented this reporting period.",
    };
  }
  if (positive && !followUp) {
    return {
      measureId: "Q134",
      patientId: patient.id,
      patientDisplay: display,
      status: "not_met",
      reason: "Positive screen without documented follow-up plan.",
    };
  }
  return {
    measureId: "Q134",
    patientId: patient.id,
    patientDisplay: display,
    status: "met",
    reason: positive ? "Positive screen + follow-up plan documented." : "Screened, negative result.",
  };
}

function evalTobacco(d: PatientDataset): PatientMeasureResult | null {
  const { patient, encounters, notes, messages } = d;
  const display = patient.displayName ?? patient.id;
  if (patient.age < 12) return null;
  // Denominator requires ≥2 encounters during the reporting period
  if (encounters.length < 2) return null;

  if (patient.flags?.limitedLifeExpectancy || patient.flags?.hospice) {
    return {
      measureId: "Q138",
      patientId: patient.id,
      patientDisplay: display,
      status: "excluded",
      reason: "Hospice / limited life expectancy — excluded per CMS138.",
    };
  }

  const { performed, user, cessationOffered } = findTobacco(notes, messages);
  if (!performed) {
    return {
      measureId: "Q138",
      patientId: patient.id,
      patientDisplay: display,
      status: "not_met",
      reason: "Tobacco use not assessed in last 24 months.",
    };
  }
  if (user && !cessationOffered) {
    return {
      measureId: "Q138",
      patientId: patient.id,
      patientDisplay: display,
      status: "not_met",
      reason: "User identified but no cessation intervention documented.",
    };
  }
  return {
    measureId: "Q138",
    patientId: patient.id,
    patientDisplay: display,
    status: "met",
    reason: user
      ? "User screened + cessation intervention offered."
      : "Screened, non-user.",
  };
}

function evalHypertension(d: PatientDataset): PatientMeasureResult | null {
  const { patient, encounters } = d;
  const display = patient.displayName ?? patient.id;
  if (patient.age < 18 || patient.age > 85) return null;
  if (!hasCondition(patient, "hypertension", "htn", "i10")) return null;

  if (patient.flags?.pregnancy) {
    return {
      measureId: "Q236",
      patientId: patient.id,
      patientDisplay: display,
      status: "excluded",
      reason: "Pregnancy during reporting period — excluded per CMS165.",
    };
  }
  if (patient.flags?.hospice) {
    return {
      measureId: "Q236",
      patientId: patient.id,
      patientDisplay: display,
      status: "excluded",
      reason: "Hospice — excluded per CMS165.",
    };
  }

  const bp = mostRecentBp(encounters);
  if (!bp) {
    return {
      measureId: "Q236",
      patientId: patient.id,
      patientDisplay: display,
      status: "not_met",
      reason: "No BP recorded during the reporting period.",
    };
  }
  if (bp.sys < 140 && bp.dia < 90) {
    return {
      measureId: "Q236",
      patientId: patient.id,
      patientDisplay: display,
      status: "met",
      reason: `Most recent BP ${bp.sys}/${bp.dia} (controlled).`,
    };
  }
  return {
    measureId: "Q236",
    patientId: patient.id,
    patientDisplay: display,
    status: "not_met",
    reason: `Most recent BP ${bp.sys}/${bp.dia} (uncontrolled).`,
  };
}

function evalMedRec(d: PatientDataset): PatientMeasureResult | null {
  const { patient, notes, messages } = d;
  const display = patient.displayName ?? patient.id;
  if ((patient.postDischargeWindows ?? 0) < 1) return null;

  const performed = findMedRec(notes, messages);
  if (!performed) {
    return {
      measureId: "Q130",
      patientId: patient.id,
      patientDisplay: display,
      status: "not_met",
      reason: "No medication reconciliation documented within 30 days of discharge.",
    };
  }
  return {
    measureId: "Q130",
    patientId: patient.id,
    patientDisplay: display,
    status: "met",
    reason: "Medication reconciliation documented post-discharge.",
  };
}

const EVALUATORS: Record<MeasureId, (d: PatientDataset) => PatientMeasureResult | null> = {
  Q134: evalDepression,
  Q138: evalTobacco,
  Q236: evalHypertension,
  Q130: evalMedRec,
};

function summarizeMeasure(
  id: MeasureId,
  results: PatientMeasureResult[],
): MeasureSummary {
  const meta = MEASURES[id];
  const denominator = results.length;
  const exclusions = results.filter((r) => r.status === "excluded").length;
  const numerator = results.filter((r) => r.status === "met").length;
  const effectiveDenominator = Math.max(denominator - exclusions, 0);
  const performanceRate =
    effectiveDenominator === 0 ? 0 : (numerator / effectiveDenominator) * 100;

  // CMS scoring: 3-point floor for reporting + linear ramp to 10 at benchmark
  let qualityPoints = 0;
  if (denominator > 0) {
    if (performanceRate >= meta.benchmark) {
      qualityPoints = 10;
    } else {
      // Linear from 3 (at 0% performance, but measure was reported) to 10 (at benchmark)
      qualityPoints = 3 + (performanceRate / meta.benchmark) * 7;
    }
  }

  return {
    id: meta.id,
    cmsId: meta.cmsId,
    title: meta.title,
    shortName: meta.shortName,
    domain: meta.domain,
    description: meta.description,
    denominator,
    numerator,
    exclusions,
    performanceRate: Math.round(performanceRate * 10) / 10,
    benchmark: meta.benchmark,
    qualityPoints: Math.round(qualityPoints * 10) / 10,
    perPatient: results,
  };
}

function buildActionItems(measures: MeasureSummary[]): ActionItem[] {
  const items: ActionItem[] = [];
  for (const m of measures) {
    const open = m.perPatient.filter((r) => r.status === "not_met");
    if (open.length === 0) continue;

    const gapToBenchmark = Math.max(0, m.benchmark - m.performanceRate);
    const priority: ActionItem["priority"] =
      gapToBenchmark >= 20 ? "high" : gapToBenchmark >= 8 ? "medium" : "low";

    const closeable = open.slice(0, Math.max(1, Math.ceil(open.length / 2)));
    items.push({
      measureId: m.id,
      title: `Close ${m.shortName} gaps`,
      priority,
      gap: open.length,
      impact:
        gapToBenchmark > 0
          ? `Closing ~${closeable.length} chart${closeable.length === 1 ? "" : "s"} moves rate +${Math.min(
              gapToBenchmark,
              Math.round((closeable.length / Math.max(m.denominator - m.exclusions, 1)) * 100),
            )} pts toward the ${m.benchmark}% benchmark.`
          : `Performance is above benchmark — sustain documentation cadence.`,
    });
  }
  return items.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });
}

const DEFAULT_WEIGHTS = { quality: 0.30, pi: 0.25, ia: 0.15, cost: 0.30 };
const PENALTY_THRESHOLD = 75;
const EXCEPTIONAL_THRESHOLD = 89;

function adjustmentFor(finalScore: number): {
  paymentAdjustmentPercent: number;
  isPenalty: boolean;
  isExceptional: boolean;
} {
  let adjustment = 0;
  let isPenalty = false;
  let isExceptional = false;
  if (finalScore < PENALTY_THRESHOLD) {
    adjustment = -9.0 * ((PENALTY_THRESHOLD - finalScore) / PENALTY_THRESHOLD);
    isPenalty = true;
  } else {
    adjustment = 9.0 * ((finalScore - PENALTY_THRESHOLD) / (100 - PENALTY_THRESHOLD));
    if (finalScore >= EXCEPTIONAL_THRESHOLD) {
      isExceptional = true;
      adjustment += 1.5;
    }
  }
  return {
    paymentAdjustmentPercent: Number(adjustment.toFixed(2)),
    isPenalty,
    isExceptional,
  };
}

/**
 * Evaluate the quality category from raw patient data and roll up into a full
 * MIPS projection. Pass per-category overrides via `inputs`; unspecified
 * categories use sensible defaults (PI 75, IA 30/40, Cost 78).
 */
export function evaluateMips(
  datasets: PatientDataset[],
  inputs: MipsCategoryInputs = {},
  opts: { reportingPeriod?: { start: string; end: string } } = {},
): MipsEvaluation {
  const measureIds: MeasureId[] = ["Q134", "Q138", "Q236", "Q130"];
  const measures: MeasureSummary[] = measureIds.map((id) => {
    const results: PatientMeasureResult[] = [];
    for (const d of datasets) {
      const r = EVALUATORS[id](d);
      if (r) results.push(r);
    }
    return summarizeMeasure(id, results);
  });

  const reportedMeasures = measures.filter((m) => m.denominator > 0);
  const totalEarned = reportedMeasures.reduce((s, m) => s + m.qualityPoints, 0);
  const totalAvailable = reportedMeasures.length * 10;
  const categoryScore = totalAvailable === 0 ? 0 : (totalEarned / totalAvailable) * 100;

  const piRaw = inputs.promotingInteroperability ?? 75;
  const iaRawPts = inputs.improvementActivities ?? 30;
  const iaRaw = (iaRawPts / 40) * 100;
  const costRaw = inputs.costScore ?? 78;

  const weighted = {
    quality: categoryScore * DEFAULT_WEIGHTS.quality,
    pi: piRaw * DEFAULT_WEIGHTS.pi,
    ia: iaRaw * DEFAULT_WEIGHTS.ia,
    cost: costRaw * DEFAULT_WEIGHTS.cost,
  };
  const finalScore =
    Math.round((weighted.quality + weighted.pi + weighted.ia + weighted.cost) * 100) / 100;

  const adj = adjustmentFor(finalScore);

  const now = new Date();
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const defaultEnd = now.toISOString();

  return {
    generatedAt: now.toISOString(),
    reportingPeriod: opts.reportingPeriod ?? { start: defaultStart, end: defaultEnd },
    patientCount: datasets.length,
    quality: {
      measures,
      totalEarned: Math.round(totalEarned * 10) / 10,
      totalAvailable,
      categoryScore: Math.round(categoryScore * 10) / 10,
    },
    categories: {
      quality: { weight: DEFAULT_WEIGHTS.quality, raw: Math.round(categoryScore * 10) / 10, weighted: Math.round(weighted.quality * 10) / 10 },
      pi: { weight: DEFAULT_WEIGHTS.pi, raw: piRaw, weighted: Math.round(weighted.pi * 10) / 10 },
      ia: { weight: DEFAULT_WEIGHTS.ia, raw: Math.round(iaRaw * 10) / 10, weighted: Math.round(weighted.ia * 10) / 10 },
      cost: { weight: DEFAULT_WEIGHTS.cost, raw: costRaw, weighted: Math.round(weighted.cost * 10) / 10 },
    },
    finalScore,
    ...adj,
    actionItems: buildActionItems(measures),
  };
}

/**
 * De-identify a MIPS evaluation for export: strip patient display names and
 * replace patient IDs with stable opaque tokens. Quality math and per-row
 * status/reason are preserved so the report remains useful to QPP auditors
 * and research collaborators.
 */
export function deidentifyEvaluation(evaluation: MipsEvaluation): MipsEvaluation {
  const tokens = new Map<string, string>();
  let counter = 1;
  const tokenize = (id: string): string => {
    const existing = tokens.get(id);
    if (existing) return existing;
    const t = `PT-${String(counter++).padStart(4, "0")}`;
    tokens.set(id, t);
    return t;
  };

  return {
    ...evaluation,
    quality: {
      ...evaluation.quality,
      measures: evaluation.quality.measures.map((m) => ({
        ...m,
        perPatient: m.perPatient.map((p) => ({
          ...p,
          patientId: tokenize(p.patientId),
          patientDisplay: tokenize(p.patientId),
        })),
      })),
    },
  };
}
