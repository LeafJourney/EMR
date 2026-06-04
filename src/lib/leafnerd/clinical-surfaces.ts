/**
 * Leafnerd "FHIR Intelligence" — SERVER-ONLY clinical-surface data access.
 *
 * Powers the six Clinical rail surfaces (Patients / Encounters / Observations /
 * Conditions / Medications / Labs). Mirrors the lazy-prisma + per-query try/catch
 * "never throw" pattern in `server-data.ts`: it resolves the dedicated demo org
 * (slug "leafnerd-demo"), scopes every query to it, and — if the org is missing
 * or any query throws — returns a complete CURATED FALLBACK so an investor-demo
 * screen can never look empty or blow up.
 *
 * NOT a client module (no "use client"). Importing it from the browser bundle
 * would drag Prisma/pg in; client surfaces use their own internal fallbacks.
 *
 * Field/enum names below were read directly from prisma/schema.prisma and the
 * shapes written by scripts/seed-leafnerd-demo.ts:
 *   - Patient.intakeAnswers JSON keys: cohort, mrn, riskScore, riskLevel, hcc,
 *     openGaps, identityMatch, source, seedTag
 *   - ClinicalObservation.evidence JSON keys: loinc, value, unit
 *   - ClinicalObservation / PastMedicalCondition / PatientMedication carry NO
 *     organizationId column — they are scoped through the patient relation.
 *   - PatientMedication "unmapped" is inferred from `notes` (the seed writes
 *     "local vocab '<CODE>' ... (unmapped)" for the MTF1000-style slice).
 *   - LabResult rows are NOT seeded → labs always uses a curated fallback.
 */
import type {
  LeafnerdClinicalData,
  PatientRow,
  EncounterRow,
  ObservationRow,
  ConditionRow,
  MedicationRow,
  LabRow,
  LabMarker,
  RiskLevel,
} from "./types";

const DEMO_ORG_SLUG = "leafnerd-demo";

// take limits per the contract (patients ~60, everything else ~40).
const TAKE_PATIENTS = 60;
const TAKE_OTHERS = 40;

// ---------------------------------------------------------------------------
// Small pure helpers (deterministic — no Math.random, SSR-safe).
// ---------------------------------------------------------------------------

/** Read a string off an unknown JSON object, else undefined. */
function jStr(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return undefined;
}

/** Read a number off an unknown JSON object, else undefined. */
function jNum(obj: unknown, key: string): number | undefined {
  if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** Compute integer age (years) from a date of birth. */
function ageFromDob(dob: Date | null | undefined): number {
  if (!dob) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age > 0 && age < 130 ? age : 0;
}

/** Coerce an arbitrary string to the RiskLevel union, defaulting to "Moderate". */
function coerceRisk(value: string | undefined): RiskLevel {
  switch (value) {
    case "Critical":
    case "High":
    case "Moderate":
    case "Low":
      return value;
    default:
      return "Moderate";
  }
}

/** Derive a RiskLevel from a 0..1 score (matches the seed's riskLevel()). */
function riskFromScore(score: number): RiskLevel {
  if (score >= 0.85) return "Critical";
  if (score >= 0.7) return "High";
  if (score >= 0.45) return "Moderate";
  return "Low";
}

/**
 * Compact "time ago" label for the most-recent encounter (e.g. "3d", "2w",
 * "5mo"), or "—" when there is no encounter. Used for PatientRow.lastEnc.
 */
function lastEncLabel(when: Date | null | undefined): string {
  if (!when) return "—";
  const ms = Date.now() - when.getTime();
  if (ms < 0) return "—";
  const days = Math.floor(ms / 86400000);
  if (days <= 0) return "today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/** ISO-string a nullable date for the client (dates serialized as strings). */
function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

/** True when a medication's notes describe an unmapped local vocabulary code. */
function isUnmapped(notes: string | null | undefined): boolean {
  if (!notes) return false;
  const n = notes.toLowerCase();
  return (
    n.includes("local vocab") ||
    n.includes("unmapped") ||
    n.includes("mtf1000") ||
    /mapping confidence\s*<\s*0\.\d/.test(n)
  );
}

// ---------------------------------------------------------------------------
// CURATED FALLBACK — a self-sufficient set of believable rows reused whenever
// the DB/org is unavailable or a per-list query throws. Names are shared across
// lists so the demo reads as one coherent population.
// ---------------------------------------------------------------------------

const FB_PATIENTS: PatientRow[] = [
  { name: "Marcus Delgado", id: "ln-fb-p1", age: 67, sex: "M", risk: "Critical", score: 0.91, hcc: 4.02, gaps: 3, cohort: "CHF · CKD", lastEnc: "3d", source: "EHR", match: 0.97 },
  { name: "Priya Nair", id: "ln-fb-p2", age: 58, sex: "F", risk: "High", score: 0.74, hcc: 3.47, gaps: 2, cohort: "Diabetes", lastEnc: "9d", source: "Claims", match: 0.93 },
  { name: "Andre Boucher", id: "ln-fb-p3", age: 71, sex: "M", risk: "High", score: 0.78, hcc: 3.6, gaps: 4, cohort: "COPD", lastEnc: "2w", source: "EHR", match: 0.95 },
  { name: "Sofia Romano", id: "ln-fb-p4", age: 49, sex: "F", risk: "Moderate", score: 0.51, hcc: 2.73, gaps: 1, cohort: "HTN", lastEnc: "5d", source: "EHR", match: 0.96 },
  { name: "Hassan Ali", id: "ln-fb-p5", age: 44, sex: "M", risk: "Moderate", score: 0.47, hcc: 2.6, gaps: 0, cohort: "Obesity", lastEnc: "3w", source: "Wearable", match: 0.78 },
  { name: "Grace Okoro", id: "ln-fb-p6", age: 39, sex: "F", risk: "Low", score: 0.42, hcc: 2.44, gaps: 1, cohort: "Anxiety · Insomnia", lastEnc: "6d", source: "EHR", match: 0.94 },
  { name: "Daniel Kim", id: "ln-fb-p7", age: 62, sex: "M", risk: "Moderate", score: 0.58, hcc: 2.96, gaps: 2, cohort: "Chronic pain", lastEnc: "11d", source: "Claims", match: 0.9 },
  { name: "Elena Petrov", id: "ln-fb-p8", age: 76, sex: "F", risk: "Critical", score: 0.88, hcc: 3.92, gaps: 3, cohort: "CHF · CKD", lastEnc: "today", source: "EHR", match: 0.98 },
];

const FB_ENCOUNTERS: EncounterRow[] = [
  { id: "ln-fb-e1", patientId: "ln-fb-p1", patientName: "Marcus Delgado", status: "complete", modality: "in_person", scheduledFor: "2026-05-31T16:00:00.000Z", completedAt: "2026-05-31T16:25:00.000Z", reason: "Congestive heart failure with chronic kidney disease", provider: "Dr. Reyes (demo)" },
  { id: "ln-fb-e2", patientId: "ln-fb-p2", patientName: "Priya Nair", status: "complete", modality: "video", scheduledFor: "2026-05-25T18:30:00.000Z", completedAt: "2026-05-25T18:55:00.000Z", reason: "Type 2 diabetes mellitus", provider: "Dr. Reyes (demo)" },
  { id: "ln-fb-e3", patientId: "ln-fb-p3", patientName: "Andre Boucher", status: "complete", modality: "in_person", scheduledFor: "2026-05-20T15:00:00.000Z", completedAt: "2026-05-20T15:25:00.000Z", reason: "Chronic obstructive pulmonary disease", provider: "Dr. Reyes (demo)" },
  { id: "ln-fb-e4", patientId: "ln-fb-p4", patientName: "Sofia Romano", status: "complete", modality: "in_person", scheduledFor: "2026-05-29T17:00:00.000Z", completedAt: "2026-05-29T17:25:00.000Z", reason: "Essential hypertension", provider: "Dr. Reyes (demo)" },
  { id: "ln-fb-e5", patientId: "ln-fb-p7", patientName: "Daniel Kim", status: "complete", modality: "video", scheduledFor: "2026-05-23T19:00:00.000Z", completedAt: "2026-05-23T19:25:00.000Z", reason: "Chronic neuropathic pain syndrome", provider: "Dr. Reyes (demo)" },
  { id: "ln-fb-e6", patientId: "ln-fb-p8", patientName: "Elena Petrov", status: "complete", modality: "in_person", scheduledFor: "2026-06-03T14:00:00.000Z", completedAt: "2026-06-03T14:25:00.000Z", reason: "Congestive heart failure with chronic kidney disease", provider: "Dr. Reyes (demo)" },
];

const FB_OBSERVATIONS: ObservationRow[] = [
  { id: "ln-fb-o1", patientId: "ln-fb-p1", patientName: "Marcus Delgado", category: "symptom_trend", severity: "notable", summary: "Blood pressure 156/94 mmHg recorded at last visit.", createdAt: "2026-05-31T16:25:00.000Z", loinc: "85354-9", value: "156/94", unit: "mmHg", actionSuggested: "Consider antihypertensive titration." },
  { id: "ln-fb-o2", patientId: "ln-fb-p2", patientName: "Priya Nair", category: "medication_response", severity: "concern", summary: "HbA1c 8.9% — above target.", createdAt: "2026-05-25T18:55:00.000Z", loinc: "4548-4", value: "8.9", unit: "%", actionSuggested: "Overdue for glycemic recheck; flag care gap." },
  { id: "ln-fb-o3", patientId: "ln-fb-p3", patientName: "Andre Boucher", category: "symptom_trend", severity: "info", summary: "Blood pressure 128/82 mmHg recorded at last visit.", createdAt: "2026-05-20T15:25:00.000Z", loinc: "85354-9", value: "128/82", unit: "mmHg", actionSuggested: null },
  { id: "ln-fb-o4", patientId: "ln-fb-p8", patientName: "Elena Petrov", category: "medication_response", severity: "concern", summary: "HbA1c 9.4% — above target.", createdAt: "2026-06-03T14:25:00.000Z", loinc: "4548-4", value: "9.4", unit: "%", actionSuggested: "Overdue for glycemic recheck; flag care gap." },
  { id: "ln-fb-o5", patientId: "ln-fb-p4", patientName: "Sofia Romano", category: "symptom_trend", severity: "info", summary: "Blood pressure 134/86 mmHg recorded at last visit.", createdAt: "2026-05-29T17:25:00.000Z", loinc: "85354-9", value: "134/86", unit: "mmHg", actionSuggested: null },
];

const FB_CONDITIONS: ConditionRow[] = [
  { id: "ln-fb-c1", patientId: "ln-fb-p1", patientName: "Marcus Delgado", condition: "Congestive heart failure with chronic kidney disease", onsetYear: 2015, source: "imported", notes: "Synthetic CHF · CKD cohort member for the Leafnerd demo." },
  { id: "ln-fb-c2", patientId: "ln-fb-p2", patientName: "Priya Nair", condition: "Type 2 diabetes mellitus", onsetYear: 2013, source: "imported", notes: "Synthetic Diabetes cohort member for the Leafnerd demo." },
  { id: "ln-fb-c3", patientId: "ln-fb-p3", patientName: "Andre Boucher", condition: "Chronic obstructive pulmonary disease", onsetYear: 2011, source: "imported", notes: "Synthetic COPD cohort member for the Leafnerd demo." },
  { id: "ln-fb-c4", patientId: "ln-fb-p4", patientName: "Sofia Romano", condition: "Essential hypertension", onsetYear: 2016, source: "imported", notes: "Synthetic HTN cohort member for the Leafnerd demo." },
  { id: "ln-fb-c5", patientId: "ln-fb-p7", patientName: "Daniel Kim", condition: "Chronic neuropathic pain syndrome", onsetYear: 2018, source: "imported", notes: "Synthetic Chronic pain cohort member for the Leafnerd demo." },
];

const FB_MEDICATIONS: MedicationRow[] = [
  { id: "ln-fb-m1", patientId: "ln-fb-p2", patientName: "Priya Nair", name: "Metformin 1000mg", genericName: "metformin", type: "prescription", dosage: "1000mg BID", prescriber: "Dr. Reyes (demo)", unmapped: true, notes: "local vocab 'MTF1000' · RxNorm mapping confidence < 0.6 (unmapped)" },
  { id: "ln-fb-m2", patientId: "ln-fb-p2", patientName: "Priya Nair", name: "Empagliflozin 10mg", genericName: "empagliflozin", type: "prescription", dosage: "10mg daily", prescriber: "Dr. Reyes (demo)", unmapped: false, notes: null },
  { id: "ln-fb-m3", patientId: "ln-fb-p1", patientName: "Marcus Delgado", name: "Furosemide 40mg", genericName: "furosemide", type: "prescription", dosage: "40mg daily", prescriber: "Dr. Reyes (demo)", unmapped: false, notes: null },
  { id: "ln-fb-m4", patientId: "ln-fb-p3", patientName: "Andre Boucher", name: "Albuterol HFA", genericName: "albuterol", type: "prescription", dosage: "90mcg PRN", prescriber: "Dr. Reyes (demo)", unmapped: true, notes: "local vocab 'ALB90LOCAL' · RxNorm mapping confidence < 0.6 (unmapped)" },
  { id: "ln-fb-m5", patientId: "ln-fb-p6", patientName: "Grace Okoro", name: "CBD:THC 20:1 tincture", genericName: "cannabidiol", type: "cannabis", dosage: "0.5mL nightly", prescriber: "Dr. Reyes (demo)", unmapped: true, notes: "local vocab 'CBDTHC201' · RxNorm mapping confidence < 0.6 (unmapped)" },
  { id: "ln-fb-m6", patientId: "ln-fb-p7", patientName: "Daniel Kim", name: "Gabapentin 300mg", genericName: "gabapentin", type: "prescription", dosage: "300mg TID", prescriber: "Dr. Reyes (demo)", unmapped: false, notes: null },
];

/**
 * Curated labs — the seed does NOT create LabResult rows, so this is ALWAYS the
 * source for the Labs surface (DB or not). ~8 believable panels (CMP, Lipid,
 * HbA1c, CBC, Liver) with a few abnormal markers across a few demo patients.
 */
const FB_LABS: LabRow[] = [
  {
    id: "ln-fb-l1", patientId: "ln-fb-p2", patientName: "Priya Nair", panelName: "HbA1c",
    receivedAt: "2026-05-25T13:00:00.000Z", abnormalFlag: true, reviewOutcome: "needs_followup",
    markers: [{ name: "Hemoglobin A1c", value: 8.9, unit: "%", abnormal: true }],
  },
  {
    id: "ln-fb-l2", patientId: "ln-fb-p2", patientName: "Priya Nair", panelName: "Comprehensive Metabolic Panel",
    receivedAt: "2026-05-25T13:00:00.000Z", abnormalFlag: true, reviewOutcome: "needs_followup",
    markers: [
      { name: "Glucose", value: 168, unit: "mg/dL", abnormal: true },
      { name: "Sodium", value: 139, unit: "mmol/L", abnormal: false },
      { name: "Potassium", value: 4.4, unit: "mmol/L", abnormal: false },
      { name: "Creatinine", value: 1.1, unit: "mg/dL", abnormal: false },
      { name: "eGFR", value: 72, unit: "mL/min", abnormal: false },
    ],
  },
  {
    id: "ln-fb-l3", patientId: "ln-fb-p1", patientName: "Marcus Delgado", panelName: "Comprehensive Metabolic Panel",
    receivedAt: "2026-05-31T12:30:00.000Z", abnormalFlag: true, reviewOutcome: "needs_followup",
    markers: [
      { name: "Creatinine", value: 2.3, unit: "mg/dL", abnormal: true },
      { name: "eGFR", value: 38, unit: "mL/min", abnormal: true },
      { name: "Potassium", value: 5.3, unit: "mmol/L", abnormal: true },
      { name: "BUN", value: 41, unit: "mg/dL", abnormal: true },
    ],
  },
  {
    id: "ln-fb-l4", patientId: "ln-fb-p1", patientName: "Marcus Delgado", panelName: "Lipid Panel",
    receivedAt: "2026-05-31T12:30:00.000Z", abnormalFlag: true, reviewOutcome: "needs_followup",
    markers: [
      { name: "Total cholesterol", value: 232, unit: "mg/dL", abnormal: true },
      { name: "LDL", value: 158, unit: "mg/dL", abnormal: true },
      { name: "HDL", value: 38, unit: "mg/dL", abnormal: true },
      { name: "Triglycerides", value: 210, unit: "mg/dL", abnormal: true },
    ],
  },
  {
    id: "ln-fb-l5", patientId: "ln-fb-p4", patientName: "Sofia Romano", panelName: "Lipid Panel",
    receivedAt: "2026-05-29T14:00:00.000Z", abnormalFlag: false, reviewOutcome: "looks_good",
    markers: [
      { name: "Total cholesterol", value: 184, unit: "mg/dL", abnormal: false },
      { name: "LDL", value: 102, unit: "mg/dL", abnormal: false },
      { name: "HDL", value: 54, unit: "mg/dL", abnormal: false },
      { name: "Triglycerides", value: 138, unit: "mg/dL", abnormal: false },
    ],
  },
  {
    id: "ln-fb-l6", patientId: "ln-fb-p3", patientName: "Andre Boucher", panelName: "Complete Blood Count",
    receivedAt: "2026-05-20T11:45:00.000Z", abnormalFlag: true, reviewOutcome: "needs_followup",
    markers: [
      { name: "WBC", value: 12.6, unit: "10^3/uL", abnormal: true },
      { name: "Hemoglobin", value: 13.4, unit: "g/dL", abnormal: false },
      { name: "Hematocrit", value: 41, unit: "%", abnormal: false },
      { name: "Platelets", value: 268, unit: "10^3/uL", abnormal: false },
    ],
  },
  {
    id: "ln-fb-l7", patientId: "ln-fb-p7", patientName: "Daniel Kim", panelName: "Liver Panel",
    receivedAt: "2026-05-23T15:15:00.000Z", abnormalFlag: true, reviewOutcome: "needs_followup",
    markers: [
      { name: "ALT", value: 64, unit: "U/L", abnormal: true },
      { name: "AST", value: 58, unit: "U/L", abnormal: true },
      { name: "Alkaline phosphatase", value: 102, unit: "U/L", abnormal: false },
      { name: "Total bilirubin", value: 1.0, unit: "mg/dL", abnormal: false },
    ],
  },
  {
    id: "ln-fb-l8", patientId: "ln-fb-p8", patientName: "Elena Petrov", panelName: "HbA1c",
    receivedAt: "2026-06-03T10:00:00.000Z", abnormalFlag: true, reviewOutcome: "needs_followup",
    markers: [{ name: "Hemoglobin A1c", value: 9.4, unit: "%", abnormal: true }],
  },
];

/** The complete curated payload — returned wholesale if the org is missing. */
const FALLBACK: LeafnerdClinicalData = {
  patients: FB_PATIENTS,
  encounters: FB_ENCOUNTERS,
  observations: FB_OBSERVATIONS,
  conditions: FB_CONDITIONS,
  medications: FB_MEDICATIONS,
  labs: FB_LABS,
};

// ---------------------------------------------------------------------------
// Main entry — resolve the demo org, then map each list independently.
// ---------------------------------------------------------------------------

/**
 * Real (seeded) clinical lists for the Clinical rail surfaces, scoped to the
 * "leafnerd-demo" org. NEVER throws; ALWAYS returns a full LeafnerdClinicalData
 * with non-empty lists (each list falls back independently to a curated set).
 */
export async function getLeafnerdClinicalData(): Promise<LeafnerdClinicalData> {
  // Lazy-import prisma so a missing/blown-up DB layer can never crash a render.
  let prisma: typeof import("@/lib/db/prisma").prisma | null = null;
  try {
    prisma = (await import("@/lib/db/prisma")).prisma;
  } catch {
    return cloneFallback(); // DB layer unavailable — pure curated payload.
  }
  if (!prisma) return cloneFallback();

  // Resolve the demo org by slug. If absent or the lookup throws, everything
  // falls back wholesale.
  let orgId: string | null = null;
  try {
    const org = await prisma.organization.findUnique({
      where: { slug: DEMO_ORG_SLUG },
      select: { id: true },
    });
    orgId = org?.id ?? null;
  } catch {
    return cloneFallback();
  }
  if (!orgId) return cloneFallback();

  // Each list is independently mapped; on ANY failure it returns its own
  // curated fallback. Run them concurrently.
  const [patients, encounters, observations, conditions, medications] =
    await Promise.all([
      loadPatients(prisma, orgId),
      loadEncounters(prisma, orgId),
      loadObservations(prisma, orgId),
      loadConditions(prisma, orgId),
      loadMedications(prisma, orgId),
    ]);

  // Labs are never seeded — always curated. (We still scope the curated rows.)
  const labs = await loadLabs(prisma, orgId);

  return {
    patients: patients.length ? patients : FB_PATIENTS,
    encounters: encounters.length ? encounters : FB_ENCOUNTERS,
    observations: observations.length ? observations : FB_OBSERVATIONS,
    conditions: conditions.length ? conditions : FB_CONDITIONS,
    medications: medications.length ? medications : FB_MEDICATIONS,
    labs: labs.length ? labs : FB_LABS,
  };
}

type Prisma = NonNullable<typeof import("@/lib/db/prisma").prisma>;

/** Deep clone of the curated payload so callers can't mutate the singletons. */
function cloneFallback(): LeafnerdClinicalData {
  try {
    return structuredClone(FALLBACK);
  } catch {
    return JSON.parse(JSON.stringify(FALLBACK)) as LeafnerdClinicalData;
  }
}

// ---------------------------------------------------------------------------
// Per-list loaders. Each is self-contained, try/catch'd, never throws.
// ---------------------------------------------------------------------------

/**
 * patients → PatientRow[]. Reads intakeAnswers JSON (cohort/riskScore→score/
 * riskLevel→risk/hcc/openGaps→gaps/identityMatch→match/source), computes age
 * from dateOfBirth, and lastEnc from the patient's most-recent encounter.
 */
async function loadPatients(prisma: Prisma, orgId: string): Promise<PatientRow[]> {
  try {
    const rows = await prisma.patient.findMany({
      where: { organizationId: orgId, deletedAt: null },
      take: TAKE_PATIENTS,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        intakeAnswers: true,
        // Most-recent encounter (by completedAt) drives lastEnc.
        encounters: {
          orderBy: { completedAt: "desc" },
          take: 1,
          select: { completedAt: true, scheduledFor: true },
        },
      },
    });

    return rows.map((p): PatientRow => {
      const ia = p.intakeAnswers;
      const score = jNum(ia, "riskScore") ?? 0.5;
      const riskRaw = jStr(ia, "riskLevel");
      const risk = riskRaw ? coerceRisk(riskRaw) : riskFromScore(score);
      const enc = p.encounters[0];
      const lastWhen = enc?.completedAt ?? enc?.scheduledFor ?? null;
      // Patient model has no sex column; surface "—" unless intake captured it.
      const sex = jStr(ia, "sex") ?? jStr(ia, "gender") ?? "—";
      return {
        name: `${p.firstName} ${p.lastName}`.trim(),
        id: p.id,
        age: ageFromDob(p.dateOfBirth),
        sex,
        risk,
        score,
        hcc: jNum(ia, "hcc") ?? 0,
        gaps: jNum(ia, "openGaps") ?? 0,
        cohort: jStr(ia, "cohort") ?? "General",
        lastEnc: lastEncLabel(lastWhen),
        source: jStr(ia, "source") ?? "EHR",
        match: jNum(ia, "identityMatch") ?? 0.9,
      };
    });
  } catch {
    return FB_PATIENTS;
  }
}

/** encounters → EncounterRow[] (with patient name + provider name if present). */
async function loadEncounters(prisma: Prisma, orgId: string): Promise<EncounterRow[]> {
  try {
    const rows = await prisma.encounter.findMany({
      where: { organizationId: orgId },
      take: TAKE_OTHERS,
      orderBy: { completedAt: "desc" },
      select: {
        id: true,
        patientId: true,
        status: true,
        modality: true,
        scheduledFor: true,
        completedAt: true,
        reason: true,
        patient: { select: { firstName: true, lastName: true } },
        // Provider has no name column — it comes through the User relation.
        provider: { select: { user: { select: { firstName: true, lastName: true } } } },
      },
    });

    return rows.map((e): EncounterRow => {
      const u = e.provider?.user;
      const provider = u ? `${u.firstName} ${u.lastName}`.trim() : null;
      return {
        id: e.id,
        patientId: e.patientId,
        patientName: e.patient
          ? `${e.patient.firstName} ${e.patient.lastName}`.trim()
          : "Unknown patient",
        status: String(e.status),
        modality: e.modality,
        scheduledFor: iso(e.scheduledFor),
        completedAt: iso(e.completedAt),
        reason: e.reason ?? null,
        provider,
      };
    });
  } catch {
    return FB_ENCOUNTERS;
  }
}

/**
 * observations → ObservationRow[]. ClinicalObservation has no organizationId,
 * so scope through the patient relation. loinc/value/unit come from `evidence`.
 */
async function loadObservations(prisma: Prisma, orgId: string): Promise<ObservationRow[]> {
  try {
    const rows = await prisma.clinicalObservation.findMany({
      where: { patient: { organizationId: orgId } },
      take: TAKE_OTHERS,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        patientId: true,
        category: true,
        severity: true,
        summary: true,
        evidence: true,
        actionSuggested: true,
        createdAt: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    return rows.map((o): ObservationRow => {
      const ev = o.evidence;
      const value = jStr(ev, "value");
      return {
        id: o.id,
        patientId: o.patientId,
        patientName: o.patient
          ? `${o.patient.firstName} ${o.patient.lastName}`.trim()
          : "Unknown patient",
        category: String(o.category),
        severity: String(o.severity),
        summary: o.summary,
        createdAt: iso(o.createdAt),
        loinc: jStr(ev, "loinc") ?? null,
        value: value ?? null,
        unit: jStr(ev, "unit") ?? null,
        actionSuggested: o.actionSuggested ?? null,
      };
    });
  } catch {
    return FB_OBSERVATIONS;
  }
}

/**
 * conditions → ConditionRow[] from PastMedicalCondition (no organizationId;
 * scoped via patient; honors soft-delete).
 */
async function loadConditions(prisma: Prisma, orgId: string): Promise<ConditionRow[]> {
  try {
    const rows = await prisma.pastMedicalCondition.findMany({
      where: { deletedAt: null, patient: { organizationId: orgId } },
      take: TAKE_OTHERS,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        patientId: true,
        condition: true,
        onsetYear: true,
        source: true,
        notes: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    return rows.map((c): ConditionRow => ({
      id: c.id,
      patientId: c.patientId,
      patientName: c.patient
        ? `${c.patient.firstName} ${c.patient.lastName}`.trim()
        : "Unknown patient",
      condition: c.condition,
      onsetYear: c.onsetYear ?? null,
      source: c.source ?? null,
      notes: c.notes ?? null,
    }));
  } catch {
    return FB_CONDITIONS;
  }
}

/**
 * medications → MedicationRow[] from PatientMedication (no organizationId;
 * scoped via patient). `unmapped` is inferred from `notes` (local-vocab codes).
 */
async function loadMedications(prisma: Prisma, orgId: string): Promise<MedicationRow[]> {
  try {
    const rows = await prisma.patientMedication.findMany({
      where: { patient: { organizationId: orgId } },
      take: TAKE_OTHERS,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        patientId: true,
        name: true,
        genericName: true,
        type: true,
        dosage: true,
        prescriber: true,
        notes: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    return rows.map((m): MedicationRow => ({
      id: m.id,
      patientId: m.patientId,
      patientName: m.patient
        ? `${m.patient.firstName} ${m.patient.lastName}`.trim()
        : "Unknown patient",
      name: m.name,
      genericName: m.genericName ?? null,
      type: String(m.type),
      dosage: m.dosage ?? null,
      prescriber: m.prescriber ?? null,
      unmapped: isUnmapped(m.notes),
      notes: m.notes ?? null,
    }));
  } catch {
    return FB_MEDICATIONS;
  }
}

/**
 * labs → LabRow[]. The seed does NOT create LabResult rows, so this returns the
 * CURATED FALLBACK (FB_LABS). We still attempt a scoped query so that if a real
 * deployment ever has LabResult rows under the demo org, they surface — but the
 * default and guaranteed-non-empty path is the curated set.
 */
async function loadLabs(prisma: Prisma, orgId: string): Promise<LabRow[]> {
  try {
    const rows = await prisma.labResult.findMany({
      where: { organizationId: orgId },
      take: TAKE_OTHERS,
      orderBy: { receivedAt: "desc" },
      select: {
        id: true,
        patientId: true,
        panelName: true,
        receivedAt: true,
        abnormalFlag: true,
        reviewOutcome: true,
        results: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    });

    if (!rows.length) return FB_LABS; // expected path — seed creates none.

    return rows.map((l): LabRow => ({
      id: l.id,
      patientId: l.patientId,
      patientName: l.patient
        ? `${l.patient.firstName} ${l.patient.lastName}`.trim()
        : "Unknown patient",
      panelName: l.panelName,
      receivedAt: iso(l.receivedAt),
      abnormalFlag: l.abnormalFlag,
      reviewOutcome: l.reviewOutcome ?? null,
      markers: parseLabMarkers(l.results),
    }));
  } catch {
    return FB_LABS;
  }
}

/**
 * Parse the LabResult.results JSON into LabMarker[]. Schema documents the shape
 * { markerName: { value, unit, refLow?, refHigh?, abnormal } }; we map defensively.
 */
function parseLabMarkers(results: unknown): LabMarker[] {
  if (!results || typeof results !== "object") return [];
  const out: LabMarker[] = [];
  for (const [name, raw] of Object.entries(results as Record<string, unknown>)) {
    if (raw && typeof raw === "object") {
      const r = raw as Record<string, unknown>;
      const valueRaw = r.value;
      const value =
        typeof valueRaw === "number" || typeof valueRaw === "string"
          ? valueRaw
          : String(valueRaw ?? "");
      out.push({
        name,
        value,
        unit: typeof r.unit === "string" ? r.unit : undefined,
        abnormal: r.abnormal === true,
      });
    } else if (typeof raw === "number" || typeof raw === "string") {
      out.push({ name, value: raw });
    }
  }
  return out;
}
