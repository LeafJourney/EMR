// ---------------------------------------------------------------------------
// PatientRxProfile assembler — Phase 1.2 "Distributed Multi-Domain Ingestion"
// (Linear EMR-1131/EMR-1135, epic EMR-1119).
//
// Pure mapping layer: takes already-fetched Prisma row shapes and assembles
// the PatientRxProfile that evaluateRxSafety() consumes. No I/O here — the
// Prisma reads live in the server action next to the prescribe form
// (src/app/(clinician)/clinic/patients/[id]/prescribe/rx-safety-actions.ts)
// so this module stays unit-testable with mocked rows.
//
// Data sources mapped:
//   - The Organ Clearance Vault ... LabResult.results JSON (marker-name keyed;
//     see prisma seed "CMP" rows) → LOINC-coded LabResult[] for creatinine,
//     bilirubin, albumin, INR — with observation dates for freshness checks.
//   - The PGx Registry ............ no PGx column exists in the schema today,
//     so the assembler emits an empty array (the engine treats absence of
//     genomic data as a silent pass, never a warning).
//   - The Botanical & Xenobiotic Manifest ... active PatientMedication rows
//     (cannabis / supplement types), active DosingRegimens and recent DoseLogs
//     (product names tagged with their structured cannabinoid content so
//     inferCannabinoidsFromName() resolves the right compounds).
//   - Demographics ................ sex from intakeAnswers (intake +
//     demographics detail editor both write there), age from dateOfBirth.
// ---------------------------------------------------------------------------

import {
  type BotanicalExposure,
  type LabResult,
  type PatientRxProfile,
  type PgxVariant,
  LOINC,
} from "./types";

// ---------------------------------------------------------------------------
// Row shapes (structural subsets of the Prisma models — keep in sync by hand;
// the server action selects exactly these fields).
// ---------------------------------------------------------------------------

export interface PatientRowInput {
  dateOfBirth: Date | string | null;
  /** Patient.intakeAnswers JSON blob (sex/gender live in here). */
  intakeAnswers: unknown;
}

export interface LabResultRowInput {
  receivedAt: Date | string;
  /** LabResult.results JSON: { [marker]: { value, unit?, ... } } */
  results: unknown;
}

export interface MedicationRowInput {
  name: string;
  /** Prisma MedicationType: prescription | otc | supplement | cannabis */
  type: string;
  active: boolean;
}

export interface RegimenProductInput {
  name: string;
  thcConcentration: number | null;
  cbdConcentration: number | null;
  cbnConcentration: number | null;
  cbgConcentration: number | null;
}

export interface DosingRegimenRowInput {
  active: boolean;
  product: RegimenProductInput | null;
}

export interface DoseLogRowInput {
  estimatedThcMg: number | null;
  estimatedCbdMg: number | null;
  regimen: { product: RegimenProductInput | null } | null;
}

export interface PatientRxProfileRows {
  patient: PatientRowInput;
  labResults: LabResultRowInput[];
  medications: MedicationRowInput[];
  dosingRegimens: DosingRegimenRowInput[];
  doseLogs: DoseLogRowInput[];
}

// ---------------------------------------------------------------------------
// Lab marker → LOINC mapping (Organ Clearance Vault)
// ---------------------------------------------------------------------------

/**
 * Alias table for the four organ-clearance markers. LabResult.results is
 * keyed by free-form marker names ("Cr", "Creatinine", "TBili", "INR"…), so
 * matching is exact on a normalized token — substring matching would wrongly
 * capture e.g. "CrCl", "Urine albumin/creatinine", or "Microalbumin".
 */
const MARKER_ALIASES: Record<string, string[]> = {
  [LOINC.SERUM_CREATININE]: ["cr", "creatinine", "serum creatinine", "scr", "creat"],
  [LOINC.TOTAL_BILIRUBIN]: [
    "total bilirubin",
    "bilirubin total",
    "bilirubin",
    "tbili",
    "t bili",
    "bili total",
  ],
  [LOINC.ALBUMIN]: ["albumin", "alb", "serum albumin"],
  [LOINC.INR]: ["inr", "international normalized ratio", "pt inr", "pt/inr"],
};

function normalizeMarker(marker: string): string {
  return marker
    .toLowerCase()
    .replace(/[._,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve a free-form lab marker name to one of the four guardrail LOINCs. */
export function markerToLoinc(marker: string): string | null {
  const norm = normalizeMarker(marker);
  if (!norm) return null;
  for (const [loinc, aliases] of Object.entries(MARKER_ALIASES)) {
    if (aliases.includes(norm)) return loinc;
  }
  return null;
}

/**
 * Extract LOINC-coded labs from LabResult rows. Each row's `results` JSON is
 * marker-name keyed; every marker that maps to a guardrail LOINC and carries a
 * finite numeric value becomes one LabResult, stamped with the panel's
 * receivedAt so the engine can apply the 180-day freshness window.
 */
export function labsFromLabResults(rows: LabResultRowInput[]): LabResult[] {
  const out: LabResult[] = [];
  for (const row of rows) {
    if (!row?.results || typeof row.results !== "object") continue;
    const observedAt =
      row.receivedAt instanceof Date
        ? row.receivedAt.toISOString()
        : String(row.receivedAt);
    for (const [marker, raw] of Object.entries(
      row.results as Record<string, unknown>
    )) {
      const loinc = markerToLoinc(marker);
      if (!loinc) continue;
      if (!raw || typeof raw !== "object") continue;
      const value = (raw as { value?: unknown }).value;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const unit = (raw as { unit?: unknown }).unit;
      out.push({
        loinc,
        value,
        unit: typeof unit === "string" ? unit : undefined,
        observedAt,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Botanical & Xenobiotic Manifest
// ---------------------------------------------------------------------------

/**
 * CBD concentration (mg/mL or mg/unit) at or above which a product counts as
 * a "concentrated CBD extract" for the CYP2C9 anticoagulant guardrail.
 */
export const CONCENTRATED_CBD_THRESHOLD = 50;

/**
 * Tag a cannabis product name with its structured cannabinoid content, e.g.
 * "Midnight Tincture [THC, CBN]". inferCannabinoidsFromName() (which the
 * botanical layer reuses) falls back to assuming THC+CBD for unrecognizable
 * names — tagging keeps the inference faithful to the product's actual
 * concentrations instead.
 */
export function taggedProductName(product: RegimenProductInput): string {
  const tokens: string[] = [];
  if ((product.thcConcentration ?? 0) > 0) tokens.push("THC");
  if ((product.cbdConcentration ?? 0) > 0) tokens.push("CBD");
  if ((product.cbnConcentration ?? 0) > 0) tokens.push("CBN");
  if ((product.cbgConcentration ?? 0) > 0) tokens.push("CBG");
  if (tokens.length === 0) return product.name;
  return `${product.name} [${tokens.join(", ")}]`;
}

function productExposure(
  product: RegimenProductInput,
  source: string
): BotanicalExposure {
  return {
    name: taggedProductName(product),
    kind: "cannabinoid",
    concentrated:
      (product.cbdConcentration ?? 0) >= CONCENTRATED_CBD_THRESHOLD ||
      undefined,
    source,
  };
}

/**
 * Assemble the botanical/cannabinoid exposure manifest from the medication
 * list (cannabis + supplement rows), active dosing regimens (product log) and
 * recent dose logs. De-duplicated by normalized name; the earliest source in
 * the order medication_list → product_log → dosing_log wins.
 */
export function botanicalExposuresFromRows(input: {
  medications: MedicationRowInput[];
  dosingRegimens: DosingRegimenRowInput[];
  doseLogs: DoseLogRowInput[];
}): BotanicalExposure[] {
  const byName = new Map<string, BotanicalExposure>();
  const add = (e: BotanicalExposure) => {
    const key = e.name.toLowerCase().trim();
    if (!key) return;
    const existing = byName.get(key);
    if (existing) {
      // keep the first occurrence, but never lose a concentrated flag.
      if (e.concentrated && !existing.concentrated) existing.concentrated = true;
      return;
    }
    byName.set(key, e);
  };

  for (const med of input.medications) {
    if (!med.active) continue;
    if (med.type === "cannabis") {
      add({ name: med.name, kind: "cannabinoid", source: "medication_list" });
    } else if (med.type === "supplement") {
      add({ name: med.name, kind: "supplement", source: "medication_list" });
    }
    // prescription / otc rows belong in activeMeds, not the botanical manifest.
  }

  for (const regimen of input.dosingRegimens) {
    if (!regimen.active || !regimen.product) continue;
    add(productExposure(regimen.product, "product_log"));
  }

  for (const log of input.doseLogs) {
    if (log.regimen?.product) {
      add(productExposure(log.regimen.product, "dosing_log"));
      continue;
    }
    // Ad-hoc log without a regimen — fall back to the estimated mg fields.
    const tokens: string[] = [];
    if ((log.estimatedThcMg ?? 0) > 0) tokens.push("THC");
    if ((log.estimatedCbdMg ?? 0) > 0) tokens.push("CBD");
    if (tokens.length > 0) {
      add({
        name: `Patient dose log [${tokens.join(", ")}]`,
        kind: "cannabinoid",
        source: "dosing_log",
      });
    }
  }

  return Array.from(byName.values());
}

// ---------------------------------------------------------------------------
// Demographics
// ---------------------------------------------------------------------------

/** Normalize a free-text sex/gender string to the engine's binary input. */
function normalizeSex(raw: unknown): "female" | "male" | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (v === "f" || v === "female" || v === "woman") return "female";
  if (v === "m" || v === "male" || v === "man") return "male";
  return null;
}

/**
 * Resolve biological sex from the intakeAnswers blob. Checks the top-level
 * intake keys first, then every demographicsDetail section the detail editor
 * persists (FO-B3 writes fields under intake.demographicsDetail[section]).
 *
 * Defaults to "female" when undocumented: for a given creatinine the CKD-EPI
 * 2021 female parameters yield the LOWER eGFR estimate, so the renal
 * guardrail errs toward surfacing rather than suppressing a dose flag.
 */
export function sexFromIntake(intakeAnswers: unknown): "female" | "male" {
  if (intakeAnswers && typeof intakeAnswers === "object") {
    const intake = intakeAnswers as Record<string, unknown>;
    const direct = normalizeSex(intake.sex) ?? normalizeSex(intake.gender);
    if (direct) return direct;

    const detail = intake.demographicsDetail;
    if (detail && typeof detail === "object") {
      for (const section of Object.values(detail as Record<string, unknown>)) {
        if (!section || typeof section !== "object") continue;
        const fields = (section as { fields?: unknown }).fields;
        if (!fields || typeof fields !== "object") continue;
        const f = fields as Record<string, unknown>;
        const fromSection = normalizeSex(f.sex) ?? normalizeSex(f.gender);
        if (fromSection) return fromSection;
      }
    }
  }
  return "female";
}

/** Whole years between dateOfBirth and `now`. Unknown DOB → 0 (engine treats
 *  age only as a CKD-EPI parameter; 0 disables no rules). */
export function ageFromDateOfBirth(
  dateOfBirth: Date | string | null,
  now: Date = new Date()
): number {
  if (!dateOfBirth) return 0;
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 0;
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

// ---------------------------------------------------------------------------
// Top-level assembler
// ---------------------------------------------------------------------------

/**
 * Build the PatientRxProfile from pre-fetched rows. Pure — inject `now` for
 * deterministic age computation in tests.
 *
 * PGx: the schema has no pharmacogenomic storage today, so pgxVariants is
 * always [] (silent pass in the engine). When a PGx column/model lands, wire
 * it here and the PGx layer activates with zero engine changes.
 */
export function buildPatientRxProfile(
  rows: PatientRxProfileRows,
  now: Date = new Date()
): PatientRxProfile {
  const pgxVariants: PgxVariant[] = [];

  const activeMeds = rows.medications
    .filter((m) => m.active && m.name.trim().length > 0)
    .map((m) => m.name.trim());

  return {
    sex: sexFromIntake(rows.patient.intakeAnswers),
    age: ageFromDateOfBirth(rows.patient.dateOfBirth, now),
    pgxVariants,
    labs: labsFromLabResults(rows.labResults),
    activeMeds,
    botanicalExposures: botanicalExposuresFromRows({
      medications: rows.medications,
      dosingRegimens: rows.dosingRegimens,
      doseLogs: rows.doseLogs,
    }),
  };
}
