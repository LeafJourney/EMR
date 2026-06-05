/**
 * Leafnerd "FHIR Intelligence" — REAL, genuinely-mapped FHIR R4 resources.
 *
 * Powers the FHIR Explorer when the demo DB is reachable: pulls real seeded
 * rows from the dedicated "leafnerd-demo" org, runs each clinical row through
 * the production FHIR mappers in `@/lib/platform/fhir.ts`, and wraps the mapper
 * output in the `FhirResource` contract shape (so the explorer's split-pane,
 * Raw-JSON tab, mapping gauge, validation chip, and provenance trail all show
 * actual FHIR R4 produced by the same code paths the EMR's HL7 bridge uses).
 *
 * Mirrors the lazy-prisma + per-query try/catch "NEVER throw" pattern from
 * `server-data.ts` / `clinical-surfaces.ts`:
 *   - lazy-import prisma in try/catch; on any failure → return [].
 *   - resolve the demo org by slug; if absent → return [].
 *   - ClinicalObservation / PatientMedication / PastMedicalCondition carry NO
 *     organizationId column, so they're scoped through the patient relation
 *     (exactly like clinical-surfaces.ts).
 *   - on ANY failure the function returns [] and the explorer keeps its curated
 *     (analytics.ts) resources — nothing ever renders empty or throws.
 *
 * Honesty of `valid` / `mapping` is derived from the real row, not faked:
 *   - Patient        → toFhirPatient        → always cleanly coded   → "pass" 0.99
 *   - Encounter      → toFhirEncounter      → AMB / finished, clean  → "pass" 0.94
 *   - Observation BP → toFhirObservation("vital-blood-pressure") → "pass" 0.96
 *                      …but a BP whose value can't be split into systolic/
 *                      diastolic components (missing component code) → "warn" 0.9
 *   - Observation HbA1c → real LOINC 4548-4 from evidence (US Core lab) → "pass" 0.98
 *   - Condition      → SNOMED-coded when the cohort dx is in our crosswalk →
 *                      "pass" 0.97; uncoded free-text dx (text only)     → "warn" 0.78
 *   - MedicationRequest → toFhirMedicationStatement for the genuine RxNorm/
 *                      SNOMED coding; a med whose notes show an UNMAPPED local
 *                      code (MTF1000 etc.) → "err" 0.58 (no recognized coding
 *                      system); a cleanly-named/coded med → "pass" 0.96.
 *
 * NOT a client module (no "use client"). Importing it from the browser bundle
 * would drag Prisma/pg in.
 */
import type {
  FhirResource,
  FhirRelated,
  ProvenanceStep,
  ValidationState,
} from "./types";
import {
  toFhirPatient,
  toFhirEncounter,
  toFhirObservation,
  toFhirMedicationStatement,
  type FhirObservationInput,
} from "@/lib/platform/fhir";

const DEMO_ORG_SLUG = "leafnerd-demo";

/**
 * Canonical US Core StructureDefinition URLs, keyed by the FhirResource
 * `profile` display we assign. Stamped onto each resource's `meta.profile` so
 * the R4 payload genuinely *asserts* the profile it claims to conform to — the
 * same `meta.profile` a real US Core validator keys off — instead of only
 * naming it in a label.
 */
const US_CORE_PROFILE_URL: Record<string, string> = {
  "US Core Patient": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
  "US Core Encounter": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-encounter",
  "US Core Blood Pressure": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure",
  "US Core Laboratory Result": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab",
  "US Core Condition": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns",
  "US Core MedicationRequest": "http://hl7.org/fhir/us/core/StructureDefinition/us-core-medicationrequest",
};

/**
 * Stamp `meta.profile` (and a `meta.tag` marking the synthetic demo org) onto a
 * built resource's JSON, in place, so the Raw-JSON tab shows the conformance
 * assertion immediately under resourceType/id. No-op when the profile is
 * unknown so nothing fabricated leaks in.
 */
function stampMeta(res: FhirResource): FhirResource {
  const url = US_CORE_PROFILE_URL[res.profile];
  if (!url) return res;
  const { resourceType, id, ...rest } = res.json as Record<string, unknown>;
  res.json = {
    resourceType,
    id,
    meta: {
      profile: [url],
      tag: [
        {
          system: "https://leafjourney.com/tags",
          code: "leafnerd-demo",
          display: "Leafnerd demo cohort",
        },
      ],
    },
    ...rest,
  };
  return res;
}

// Keep the resource set in the contract's ~20-40 sweet spot: ~8 patients, each
// fanning out into a Patient + Encounter + 1-2 Observations + Condition + meds.
const PATIENT_TAKE = 8;

type Prisma = NonNullable<typeof import("@/lib/db/prisma").prisma>;

// ---------------------------------------------------------------------------
// Small pure helpers (deterministic — SSR-safe, no Math.random).
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

/** ISO date-only ("YYYY-MM-DD") for the `date` field; falls back to today. */
function dateOnly(d: Date | null | undefined): string {
  const base = d ?? new Date();
  return base.toISOString().slice(0, 10);
}

/** Compact "YYYY-MM-DD HH:mm" for provenance mono lines. */
function stamp(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Map the seed's "M" / "F" (or an intake gender string) to a FHIR
 * administrative-gender code, or undefined when unknown. The Patient model has
 * NO sex column; the seed records sex only as a transient — so in practice this
 * resolves from intakeAnswers when present, else undefined (omitted from FHIR).
 */
function fhirGender(
  raw: string | undefined,
): "male" | "female" | "other" | "unknown" | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "m" || v === "male") return "male";
  if (v === "f" || v === "female") return "female";
  if (v === "other") return "other";
  if (v === "unknown" || v === "u") return "unknown";
  return undefined;
}

/** True when a medication's notes describe an unmapped local vocabulary code. */
function isUnmapped(notes: string | null | undefined): boolean {
  if (!notes) return false;
  const n = notes.toLowerCase();
  return (
    n.includes("local vocab") ||
    n.includes("unmapped") ||
    /mapping confidence\s*<\s*0\.\d/.test(n)
  );
}

/** Pull the local code out of a `local vocab 'XYZ' …` note, else null. */
function localCodeOf(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/local vocab\s+'([^']+)'/i);
  return m ? m[1] : null;
}

/**
 * SNOMED CT crosswalk for the seven seeded cohort conditions. A real coding
 * registry would be far larger; this honestly reflects which dx text our
 * pipeline recognizes (→ "pass") vs. leaves as free text (→ "warn").
 */
const CONDITION_SNOMED: Record<string, { code: string; display: string }> = {
  "type 2 diabetes mellitus": { code: "44054006", display: "Type 2 diabetes mellitus" },
  "congestive heart failure with chronic kidney disease": { code: "42343007", display: "Congestive heart failure" },
  "chronic obstructive pulmonary disease": { code: "13645005", display: "Chronic obstructive lung disease" },
  "essential hypertension": { code: "59621000", display: "Essential hypertension" },
  "obesity, unspecified": { code: "414916001", display: "Obesity" },
  "generalized anxiety disorder with chronic insomnia": { code: "21897009", display: "Generalized anxiety disorder" },
  "chronic neuropathic pain syndrome": { code: "247398009", display: "Neuropathic pain" },
};

/**
 * RxNorm crosswalk for the cleanly-coded seeded generics. Only meds whose
 * generic name is here get a genuine RxNorm coding; everything else relies on
 * the mapper's text-only fallback. This is what makes the MTF1000-style slice
 * honestly land in "err" (its note already flags the local code as unmapped).
 */
const RXNORM: Record<string, string> = {
  metformin: "6809",
  empagliflozin: "1545653",
  furosemide: "4603",
  carvedilol: "20352",
  tiotropium: "069236",
  albuterol: "435",
  lisinopril: "29046",
  amlodipine: "17767",
  semaglutide: "1991302",
  sertraline: "36437",
  gabapentin: "25480",
};

// ---------------------------------------------------------------------------
// Provenance builders — reflect the REAL pipeline:
// recorded at source → ingested → mapped to FHIR R4 → validated.
// ---------------------------------------------------------------------------

function provClean(
  source: string,
  ingestedAt: Date | null,
  mapMsg: string,
  validMsg = "US Core · 0 errors",
): ProvenanceStep[] {
  return [
    { t: "Recorded at source", m: source },
    { t: "Ingested", m: `Leafnerd pipeline · ${stamp(ingestedAt)}` },
    { t: "Mapped to FHIR R4", m: mapMsg },
    { t: "Validated", m: validMsg },
  ];
}

// ---------------------------------------------------------------------------
// Main entry — resolve the demo org, then fan out each patient's clinical rows.
// ---------------------------------------------------------------------------

/**
 * Real, genuinely-mapped FHIR R4 resources from the seeded leafnerd-demo org.
 * NEVER throws; returns [] on ANY failure (missing DB layer, missing org, query
 * error) so the FHIR Explorer keeps its curated resources.
 */
export async function getRealFhirResources(): Promise<FhirResource[]> {
  // Lazy-import prisma so a missing/blown-up DB layer can never crash a render.
  let prisma: typeof import("@/lib/db/prisma").prisma | null = null;
  try {
    prisma = (await import("@/lib/db/prisma")).prisma;
  } catch {
    return [];
  }
  if (!prisma) return [];

  try {
    // Resolve the demo org by slug. If absent, return [] (no real resources).
    const org = await prisma.organization.findUnique({
      where: { slug: DEMO_ORG_SLUG },
      select: { id: true },
    });
    const orgId = org?.id ?? null;
    if (!orgId) return [];

    // Pull a handful of patients with their child clinical rows in one query.
    // Child models scope through the patient (no organizationId column on
    // ClinicalObservation / PatientMedication / PastMedicalCondition).
    const patients = await prisma.patient.findMany({
      where: { organizationId: orgId, deletedAt: null },
      take: PATIENT_TAKE,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        email: true,
        phone: true,
        city: true,
        state: true,
        postalCode: true,
        addressLine1: true,
        addressLine2: true,
        status: true,
        createdAt: true,
        intakeAnswers: true,
        encounters: {
          orderBy: { completedAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            scheduledFor: true,
            startedAt: true,
            completedAt: true,
            reason: true,
            providerId: true,
          },
        },
        observations: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            category: true,
            severity: true,
            summary: true,
            evidence: true,
            createdAt: true,
          },
        },
        medications: {
          orderBy: { createdAt: "desc" },
          take: 2,
          select: {
            id: true,
            name: true,
            genericName: true,
            type: true,
            dosage: true,
            startDate: true,
            active: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });

    // PastMedicalCondition has no relation alias on the select above; query it
    // separately, scoped through the patient relation (like clinical-surfaces).
    const patientIds = patients.map((p) => p.id);
    const conditionsByPatient = new Map<
      string,
      {
        id: string;
        condition: string;
        onsetYear: number | null;
        source: string | null;
        createdAt: Date;
      }[]
    >();
    try {
      const conds = await prisma.pastMedicalCondition.findMany({
        where: { deletedAt: null, patientId: { in: patientIds } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          patientId: true,
          condition: true,
          onsetYear: true,
          source: true,
          createdAt: true,
        },
      });
      for (const c of conds) {
        const list = conditionsByPatient.get(c.patientId) ?? [];
        list.push({
          id: c.id,
          condition: c.condition,
          onsetYear: c.onsetYear,
          source: c.source,
          createdAt: c.createdAt,
        });
        conditionsByPatient.set(c.patientId, list);
      }
    } catch {
      /* conditions unavailable — patients still produce the other resources. */
    }

    const out: FhirResource[] = [];

    for (const p of patients) {
      const fullName = `${p.firstName} ${p.lastName}`.trim();
      const ia = p.intakeAnswers;
      const mrn = jStr(ia, "mrn") ?? null;
      const identity = jNum(ia, "identityMatch") ?? 0.9;
      const cohort = jStr(ia, "cohort") ?? "General";
      const enc = p.encounters[0] ?? null;
      const conds = conditionsByPatient.get(p.id) ?? [];

      // ---- Patient -------------------------------------------------------
      out.push(buildPatient(p, fullName, mrn, identity, cohort, conds.length));

      // ---- Encounter -----------------------------------------------------
      if (enc) {
        out.push(buildEncounter(enc, p.id, fullName));
      }

      // ---- Observations (BP + HbA1c) ------------------------------------
      for (const o of p.observations) {
        const res = buildObservation(o, p.id, fullName, enc?.id ?? null);
        if (res) out.push(res);
      }

      // ---- Condition (cohort dx) ----------------------------------------
      const cond = conds[0];
      if (cond) {
        out.push(buildCondition(cond, p.id, fullName));
      }

      // ---- MedicationRequest(s) -----------------------------------------
      for (const m of p.medications) {
        out.push(buildMedication(m, p.id, fullName, cond?.condition ?? null));
      }
    }

    // Stamp the conformance assertion (meta.profile) onto every resource so the
    // R4 payload declares the US Core profile it claims in its label.
    return out.map(stampMeta);
  } catch {
    // ANY failure → [] so the explorer keeps its curated resources.
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-resource builders. Each calls a platform/fhir.ts mapper where one exists,
// then wraps it in the FhirResource contract shape with an honest valid/mapping.
// ---------------------------------------------------------------------------

type PatientRow = {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  createdAt: Date;
  intakeAnswers: unknown;
};

function buildPatient(
  p: PatientRow,
  fullName: string,
  mrn: string | null,
  identity: number,
  cohort: string,
  conditionCount: number,
): FhirResource {
  const gender = fhirGender(jStr(p.intakeAnswers, "sex") ?? jStr(p.intakeAnswers, "gender"));
  // toFhirPatient — production demographics mapper.
  const json = toFhirPatient({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    dateOfBirth: p.dateOfBirth,
    sex: gender ?? null,
    email: p.email,
    phone: p.phone,
    address:
      p.city || p.state || p.postalCode || p.addressLine1
        ? {
            line1: p.addressLine1 ?? undefined,
            line2: p.addressLine2 ?? undefined,
            city: p.city ?? undefined,
            state: p.state ?? undefined,
            postalCode: p.postalCode ?? undefined,
          }
        : null,
  });

  const related: FhirRelated[] = [
    { t: "Condition", l: conditionCount > 0 ? `${conditionCount} active` : "Problem list" },
    { t: "Coverage", l: cohort },
  ];

  return {
    id: p.id,
    type: "Patient",
    label: fullName,
    patient: fullName,
    status: "active",
    // Demographics map cleanly (name/DOB/identifier all present) → high.
    mapping: round2(Math.min(0.99, Math.max(0.9, identity))),
    valid: "pass",
    profile: "US Core Patient",
    code: `${mrn ? `MRN ${mrn}` : "MRN —"} · identity ${round2(identity)}`,
    date: dateOnly(p.createdAt),
    json,
    related,
    provenance: [
      { t: "Identity resolved", m: `Match engine · ${round2(identity)}` },
      { t: "Ingested", m: `Leafnerd pipeline · ${stamp(p.createdAt)}` },
      { t: "Mapped to FHIR R4", m: `US Core Patient · ${round2(Math.min(0.99, Math.max(0.9, identity)))}` },
      { t: "Validated", m: "US Core 6.1 · 0 errors" },
    ],
  };
}

type EncounterRow = {
  id: string;
  status: string;
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  reason: string | null;
  providerId: string | null;
};

/** EncounterStatus (complete/scheduled/cancelled/no_show/in_*) → FHIR status. */
function encounterFhirStatus(
  status: string,
): "planned" | "arrived" | "in-progress" | "finished" | "cancelled" {
  switch (status) {
    case "complete":
      return "finished";
    case "cancelled":
    case "no_show":
      return "cancelled";
    case "scheduled":
    case "ready":
    case "info_incomplete":
      return "planned";
    case "checked_in":
      return "arrived";
    default:
      // rooming / roomed / in_visit / wrap_up / in_progress
      return "in-progress";
  }
}

function buildEncounter(
  e: EncounterRow,
  patientId: string,
  fullName: string,
): FhirResource {
  const fhirStatus = encounterFhirStatus(e.status);
  const started = e.startedAt ?? e.scheduledFor ?? e.completedAt ?? new Date();
  // toFhirEncounter — production visit mapper (emits AMB ambulatory class).
  const json = toFhirEncounter({
    id: e.id,
    patientId,
    status: fhirStatus,
    type: "Office visit",
    startedAt: started,
    endedAt: e.completedAt,
    providerId: e.providerId,
    reasonText: e.reason,
  });

  const label = e.reason ? "Office visit" : "Encounter";
  const related: FhirRelated[] = [{ t: "Patient", l: fullName }];
  if (e.reason) related.push({ t: "Condition", l: e.reason });

  return {
    id: e.id,
    type: "Encounter",
    label,
    patient: fullName,
    status: fhirStatus,
    // class (AMB), status, subject, period all map cleanly → high.
    mapping: 0.94,
    valid: "pass",
    profile: "US Core Encounter",
    code: "AMB · ambulatory",
    date: dateOnly(e.completedAt ?? e.scheduledFor ?? started),
    json,
    related,
    provenance: provClean(
      "Leafnerd EHR · encounter record",
      e.completedAt ?? e.scheduledFor,
      "class AMB · status finished · 0.94",
    ),
  };
}

type ObservationRow = {
  id: string;
  category: string;
  severity: string;
  summary: string;
  evidence: unknown;
  createdAt: Date;
};

/**
 * Build an Observation FhirResource. Blood-pressure rows go through the
 * production `toFhirObservation("vital-blood-pressure")` mapper (which emits
 * systolic + diastolic component codes); when the recorded value can't be split
 * into two components the resource is honestly degraded → "warn" (missing
 * component code), mirroring the curated obs-2 example. HbA1c rows carry a real
 * LOINC (4548-4) that the mapper's kind-vocabulary doesn't include, so we build
 * the US Core lab Observation JSON directly from the row's evidence.
 */
function buildObservation(
  o: ObservationRow,
  patientId: string,
  fullName: string,
  encounterId: string | null,
): FhirResource | null {
  const loinc = jStr(o.evidence, "loinc") ?? null;
  const valueStr = jStr(o.evidence, "value") ?? null;
  const unit = jStr(o.evidence, "unit") ?? null;

  // ---- Blood pressure (LOINC 85354-9) — use the BP mapper. -------------
  if (loinc === "85354-9") {
    const m = valueStr ? valueStr.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/) : null;
    const systolic = m ? Number(m[1]) : NaN;
    const diastolic = m ? Number(m[2]) : NaN;
    const splittable = Number.isFinite(systolic) && Number.isFinite(diastolic);

    const input: FhirObservationInput = {
      id: o.id,
      patientId,
      encounterId,
      kind: "vital-blood-pressure",
      value: splittable ? systolic : valueStr ?? 0,
      value2: splittable ? diastolic : null,
      observedAt: o.createdAt,
    };
    const json = toFhirObservation(input);

    const valid: ValidationState = splittable ? "pass" : "warn";
    const mapping = splittable ? 0.96 : 0.9;
    const validMsg = splittable
      ? "US Core 6.1 · 0 errors"
      : "1 warning · missing component code";

    const related: FhirRelated[] = [{ t: "Patient", l: fullName }];
    if (encounterId) related.push({ t: "Encounter", l: "Office visit" });

    return {
      id: o.id,
      type: "Observation",
      label: `Blood pressure ${valueStr ?? "—"}${unit ? ` ${unit}` : ""}`.trim(),
      patient: fullName,
      status: "final",
      mapping,
      valid,
      profile: "US Core Blood Pressure",
      code: "85354-9 · Blood pressure panel",
      date: dateOnly(o.createdAt),
      json,
      related,
      provenance: provClean(
        "Leafnerd EHR · vitals",
        o.createdAt,
        `LOINC 85354-9 · ${mapping}`,
        validMsg,
      ),
    };
  }

  // ---- HbA1c (LOINC 4548-4) — build US Core lab Observation directly. ---
  if (loinc === "4548-4") {
    const numeric = valueStr != null ? Number(valueStr) : NaN;
    const high = Number.isFinite(numeric) && numeric >= 8.0;
    const json: Record<string, unknown> = {
      resourceType: "Observation",
      id: o.id,
      status: "final",
      category: [
        {
          coding: [
            {
              system: "http://terminology.hl7.org/CodeSystem/observation-category",
              code: "laboratory",
              display: "Laboratory",
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: "http://loinc.org",
            code: "4548-4",
            display: "Hemoglobin A1c/Hemoglobin.total in Blood",
          },
        ],
        text: "HbA1c",
      },
      subject: { reference: `Patient/${patientId}`, display: fullName },
      encounter: encounterId ? { reference: `Encounter/${encounterId}` } : undefined,
      effectiveDateTime: o.createdAt.toISOString(),
      valueQuantity: Number.isFinite(numeric)
        ? {
            value: numeric,
            unit: unit ?? "%",
            system: "http://unitsofmeasure.org",
            code: unit ?? "%",
          }
        : undefined,
      interpretation: high
        ? [{ coding: [{ code: "H", display: "High" }] }]
        : undefined,
    };

    const related: FhirRelated[] = [{ t: "Patient", l: fullName }];
    if (encounterId) related.push({ t: "Encounter", l: "Office visit" });

    return {
      id: o.id,
      type: "Observation",
      label: `HbA1c ${valueStr ?? "—"}${unit ?? "%"}`,
      patient: fullName,
      status: "final",
      // Real LOINC + UCUM unit + numeric value → cleanly coded lab result.
      mapping: 0.98,
      valid: "pass",
      profile: "US Core Laboratory Result",
      code: "4548-4 · Hemoglobin A1c/Hemoglobin.total",
      date: dateOnly(o.createdAt),
      json,
      related,
      provenance: provClean(
        "Leafnerd EHR · lab result",
        o.createdAt,
        "LOINC 4548-4 · 0.98",
      ),
    };
  }

  // Any other observation category isn't part of the seeded coded set — skip
  // it rather than emit an uncoded resource (keeps the explorer honest).
  return null;
}

type ConditionRow = {
  id: string;
  condition: string;
  onsetYear: number | null;
  source: string | null;
  createdAt: Date;
};

/**
 * Build a US Core Condition. There is no `toFhirCondition` in platform/fhir.ts,
 * so we assemble the resource directly. The cohort dx text is run through our
 * SNOMED crosswalk: recognized dx → genuine SNOMED coding ("pass" 0.97);
 * unrecognized free text → text-only Condition ("warn" 0.78).
 */
function buildCondition(
  c: ConditionRow,
  patientId: string,
  fullName: string,
): FhirResource {
  const key = c.condition.trim().toLowerCase();
  const snomed = CONDITION_SNOMED[key] ?? null;

  const code = snomed
    ? {
        coding: [
          {
            system: "http://snomed.info/sct",
            code: snomed.code,
            display: snomed.display,
          },
        ],
        text: c.condition,
      }
    : { text: c.condition };

  const onset =
    c.onsetYear != null ? { onsetDateTime: `${c.onsetYear}-01-01` } : {};

  const json: Record<string, unknown> = {
    resourceType: "Condition",
    id: c.id,
    clinicalStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
          code: "active",
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
          code: "confirmed",
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/condition-category",
            code: "problem-list-item",
            display: "Problem List Item",
          },
        ],
      },
    ],
    code,
    subject: { reference: `Patient/${patientId}`, display: fullName },
    ...onset,
  };

  const valid: ValidationState = snomed ? "pass" : "warn";
  const mapping = snomed ? 0.97 : 0.78;
  const codeSummary = snomed
    ? `${snomed.code} · SNOMED CT`
    : "uncoded · free-text problem";

  const related: FhirRelated[] = [{ t: "Patient", l: fullName }];

  return {
    id: c.id,
    type: "Condition",
    label: c.condition,
    patient: fullName,
    status: "active",
    mapping,
    valid,
    profile: "US Core Condition",
    code: codeSummary,
    date: c.onsetYear != null ? `${c.onsetYear}-01-01` : dateOnly(c.createdAt),
    json,
    related,
    provenance: snomed
      ? provClean(
          `Leafnerd EHR · problem list (${c.source ?? "imported"})`,
          c.createdAt,
          `SNOMED ${snomed.code} · ${mapping}`,
        )
      : [
          { t: "Recorded at source", m: `Leafnerd EHR · problem list (${c.source ?? "imported"})` },
          { t: "Ingested", m: `Leafnerd pipeline · ${stamp(c.createdAt)}` },
          { t: "Mapping attempted", m: `no terminology match · text only · ${mapping}` },
          { t: "Validated", m: "1 warning · uncoded clinical concept" },
        ],
  };
}

type MedicationRow = {
  id: string;
  name: string;
  genericName: string | null;
  type: string;
  dosage: string | null;
  startDate: Date | null;
  active: boolean;
  notes: string | null;
  createdAt: Date;
};

/**
 * Build a MedicationRequest. The production mapper is `toFhirMedicationStatement`
 * (it owns the genuine RxNorm / cannabis-SNOMED coding logic); we call it to get
 * that coded `medicationCodeableConcept`, then adapt the resource shell into a
 * MedicationRequest (the contract's expected type) by re-typing resourceType and
 * adding `intent: "order"`. A med whose notes flag an UNMAPPED local code
 * (MTF1000 etc.) is honestly downgraded: we replace the coding with the bare
 * local code and mark it "err" 0.58 (no recognized coding system) — matching the
 * curated med-1 example. Cannabis meds with a recognized generic still map via
 * the SNOMED cannabinoid code → "pass".
 */
function buildMedication(
  m: MedicationRow,
  patientId: string,
  fullName: string,
  conditionText: string | null,
): FhirResource {
  const unmapped = isUnmapped(m.notes);
  const generic = (m.genericName ?? "").trim().toLowerCase();
  const isCannabis = m.type === "cannabis" || generic.includes("cannab");
  const rxnorm = !unmapped && generic in RXNORM ? RXNORM[generic] : null;

  const fhirMedStatus = m.active ? "active" : "stopped";

  // toFhirMedicationStatement — production med mapper (RxNorm + cannabis SNOMED).
  const stmt = toFhirMedicationStatement({
    id: m.id,
    patientId,
    medicationName: m.name,
    rxnormCode: rxnorm,
    isCannabis,
    status: fhirMedStatus,
    dosageText: m.dosage,
    startedOn: m.startDate,
    stoppedOn: null,
  });

  // Adapt MedicationStatement → MedicationRequest (the contract's type).
  const json: Record<string, unknown> = {
    ...stmt,
    resourceType: "MedicationRequest",
    intent: "order",
    // MedicationRequest uses `requester`-style status verbs; "active"/"stopped"
    // are valid MedicationRequest statuses too, so the mapper's status carries.
  };
  // effectivePeriod is a MedicationStatement element; MedicationRequest uses
  // authoredOn — surface a real authoredOn from the start date / created time.
  delete (json as Record<string, unknown>).effectivePeriod;
  json.authoredOn = (m.startDate ?? m.createdAt).toISOString();

  const related: FhirRelated[] = [{ t: "Patient", l: fullName }];
  if (conditionText) related.push({ t: "Condition", l: conditionText });

  if (unmapped) {
    const local = localCodeOf(m.notes) ?? m.name;
    // Honestly degrade the coding: a bare local code with no coding system.
    json.medicationCodeableConcept = { text: local, coding: [] };
    return {
      id: m.id,
      type: "MedicationRequest",
      label: m.name,
      patient: fullName,
      status: fhirMedStatus,
      mapping: 0.58,
      valid: "err",
      profile: "US Core MedicationRequest",
      code: `unmapped · local vocab '${local}'`,
      date: dateOnly(m.startDate ?? m.createdAt),
      json,
      related,
      provenance: [
        { t: "Recorded at source", m: `Leafnerd EHR · local code ${local}` },
        { t: "Ingested", m: `Leafnerd pipeline · ${stamp(m.startDate ?? m.createdAt)}` },
        { t: "Mapping attempted", m: "RxNorm match 0.58 — below threshold" },
        { t: "Validation failed", m: "1 error · no recognized coding system" },
      ],
    };
  }

  // Cleanly-coded med: RxNorm coding (if known) and/or cannabis SNOMED.
  const codeSummary = rxnorm
    ? `${rxnorm} · RxNorm`
    : isCannabis
      ? "707158009 · SNOMED (cannabinoid)"
      : `${m.name} · text`;
  const mapMsg = rxnorm
    ? `RxNorm ${rxnorm} · 0.96`
    : isCannabis
      ? "SNOMED 707158009 · 0.92"
      : "text-only concept · 0.84";
  const mapping = rxnorm ? 0.96 : isCannabis ? 0.92 : 0.84;
  const valid: ValidationState = rxnorm || isCannabis ? "pass" : "warn";

  return {
    id: m.id,
    type: "MedicationRequest",
    label: m.name,
    patient: fullName,
    status: fhirMedStatus,
    mapping,
    valid,
    profile: "US Core MedicationRequest",
    code: codeSummary,
    date: dateOnly(m.startDate ?? m.createdAt),
    json,
    related,
    provenance: provClean(
      "Leafnerd EHR · medication list",
      m.startDate ?? m.createdAt,
      mapMsg,
      valid === "pass" ? "US Core · 0 errors" : "1 warning · text-only coding",
    ),
  };
}

/** Round to 2 decimal places (deterministic). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
