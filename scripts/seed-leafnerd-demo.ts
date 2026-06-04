/**
 * Leafnerd "FHIR Intelligence" — synthetic-population demo seed.
 *
 * Generates a believable, de-identified synthetic clinical population for the
 * investor demo, isolated under a DEDICATED demo Organization (slug
 * "leafnerd-demo"). Every row is tagged to that org so the data never mingles
 * with real practice data and is trivially identifiable / removable.
 *
 * Usage:
 *   npx tsx --conditions=react-server scripts/seed-leafnerd-demo.ts
 *
 * Design guarantees:
 *   - DETERMINISTIC: no Math.random(). A seeded LCG + string hash drive every
 *     value, keyed by row index, so re-runs produce identical data.
 *   - IDEMPOTENT: patients keyed by a stable per-org email
 *     (ln-demo-<n>@leafnerd.invalid); child rows are skipped if the patient
 *     already has them. Re-running creates nothing new.
 *   - RESILIENT: each model's writes are wrapped so a single failing model
 *     (e.g. a column missing due to dev-DB migration drift) logs a warning and
 *     is skipped rather than aborting the whole seed.
 *   - SAFE: never deletes or modifies any row outside the demo org. Required
 *     schema fields are satisfied with sensible synthetic values.
 *
 * Population (~1,200 patients) spans these cohorts:
 *   Type 2 diabetes · CHF·CKD · COPD · HTN · Obesity · Anxiety/Insomnia ·
 *   Chronic pain. Each gets demographics + a deterministic risk score, a couple
 *   of encounters, a few ClinicalObservations (incl. HbA1c / BP values), a
 *   PastMedicalCondition, and PatientMedications (a slice carry "unmapped"
 *   local codes like MTF1000). ~40 patients additionally get a flagged
 *   Claim + ClaimScrubResult so the Claims surface shows real anomalies.
 */

import { prisma } from "../src/lib/db/prisma";
import {
  PatientStatus,
  EncounterStatus,
  ObservationCategory,
  ObservationSeverity,
  MedicationType,
  ClaimStatus,
  ScrubStatus,
  Prisma,
} from "@prisma/client";

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------
const DEMO_ORG_SLUG = "leafnerd-demo";
const DEMO_ORG_NAME = "Leafnerd FHIR Intelligence (Demo)";
const PATIENT_COUNT = 1200;
const FLAGGED_CLAIM_COUNT = 40;
const EMAIL_DOMAIN = "leafnerd.invalid"; // RFC-6761 reserved; never deliverable.

// --------------------------------------------------------------------------
// Deterministic pseudo-random helpers (NO Math.random)
// --------------------------------------------------------------------------
/** Deterministic 32-bit hash of a string (FNV-1a style). */
function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Seeded mulberry32 PRNG → deterministic float in [0,1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(arr: T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length];
const intIn = (r: number, lo: number, hi: number): number =>
  lo + Math.floor(r * (hi - lo + 1));
const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

// --------------------------------------------------------------------------
// Cohort + demographic vocabularies
// --------------------------------------------------------------------------
interface Cohort {
  key: string;
  label: string; // matches the prototype's "cohort" labels (· separators)
  condition: string; // PastMedicalCondition.condition
  onsetBase: number; // earliest plausible onset year
  baseRisk: number; // 0..1 baseline before jitter
  meds: { name: string; generic: string; dosage: string; unmapped?: string }[];
}

const COHORTS: Cohort[] = [
  {
    key: "dm2",
    label: "Diabetes",
    condition: "Type 2 diabetes mellitus",
    onsetBase: 2010,
    baseRisk: 0.62,
    meds: [
      { name: "Metformin 1000mg", generic: "metformin", dosage: "1000mg BID", unmapped: "MTF1000" },
      { name: "Empagliflozin 10mg", generic: "empagliflozin", dosage: "10mg daily" },
    ],
  },
  {
    key: "chfckd",
    label: "CHF · CKD",
    condition: "Congestive heart failure with chronic kidney disease",
    onsetBase: 2012,
    baseRisk: 0.88,
    meds: [
      { name: "Furosemide 40mg", generic: "furosemide", dosage: "40mg daily" },
      { name: "Carvedilol 12.5mg", generic: "carvedilol", dosage: "12.5mg BID" },
    ],
  },
  {
    key: "copd",
    label: "COPD",
    condition: "Chronic obstructive pulmonary disease",
    onsetBase: 2008,
    baseRisk: 0.74,
    meds: [
      { name: "Tiotropium 18mcg", generic: "tiotropium", dosage: "18mcg daily" },
      { name: "Albuterol HFA", generic: "albuterol", dosage: "90mcg PRN", unmapped: "ALB90LOCAL" },
    ],
  },
  {
    key: "htn",
    label: "HTN",
    condition: "Essential hypertension",
    onsetBase: 2009,
    baseRisk: 0.5,
    meds: [
      { name: "Lisinopril 20mg", generic: "lisinopril", dosage: "20mg daily" },
      { name: "Amlodipine 5mg", generic: "amlodipine", dosage: "5mg daily" },
    ],
  },
  {
    key: "obesity",
    label: "Obesity",
    condition: "Obesity, unspecified",
    onsetBase: 2014,
    baseRisk: 0.46,
    meds: [
      { name: "Semaglutide 1mg", generic: "semaglutide", dosage: "1mg weekly" },
    ],
  },
  {
    key: "anx",
    label: "Anxiety · Insomnia",
    condition: "Generalized anxiety disorder with chronic insomnia",
    onsetBase: 2016,
    baseRisk: 0.42,
    meds: [
      { name: "Sertraline 50mg", generic: "sertraline", dosage: "50mg daily" },
      { name: "CBD:THC 20:1 tincture", generic: "cannabidiol", dosage: "0.5mL nightly", unmapped: "CBDTHC201" },
    ],
  },
  {
    key: "pain",
    label: "Chronic pain",
    condition: "Chronic neuropathic pain syndrome",
    onsetBase: 2013,
    baseRisk: 0.58,
    meds: [
      { name: "Gabapentin 300mg", generic: "gabapentin", dosage: "300mg TID" },
      { name: "CBD:THC 1:1 capsule", generic: "cannabis extract", dosage: "10mg BID", unmapped: "CBDTHC11CAP" },
    ],
  },
];

const FIRST_NAMES = [
  "Marcus", "Yuki", "Priya", "Andre", "Sofia", "Hassan", "Grace", "Daniel",
  "Elena", "Omar", "Wei", "Fatima", "Diego", "Aisha", "Liam", "Noor",
  "Carlos", "Mei", "Jamal", "Ingrid", "Tariq", "Lucia", "Kenji", "Rosa",
  "Samuel", "Anika", "Pedro", "Hana", "Victor", "Leila",
];
const LAST_NAMES = [
  "Delgado", "Tanaka", "Nair", "Boucher", "Romano", "Ali", "Okoro", "Kim",
  "Petrov", "Haddad", "Chen", "Hassan", "Morales", "Khan", "Murphy", "Saleh",
  "Reyes", "Lin", "Washington", "Larsson", "Aziz", "Costa", "Sato", "Vargas",
  "Brooks", "Sharma", "Alvarez", "Park", "Nguyen", "Farah",
];
const CITIES: [string, string, string][] = [
  ["Riverside", "CA", "92501"],
  ["Cedar Falls", "IA", "50613"],
  ["Northbay", "WI", "53066"],
  ["Lakewood", "CO", "80226"],
  ["Brookline", "MA", "02445"],
  ["Glendale", "AZ", "85301"],
];
const SOURCES = ["EHR", "Claims", "Wearable"];

function riskLevel(score: number): string {
  if (score >= 0.85) return "Critical";
  if (score >= 0.7) return "High";
  if (score >= 0.45) return "Moderate";
  return "Low";
}

// --------------------------------------------------------------------------
// Resilient write wrapper — tracks created/updated/skipped per model.
// --------------------------------------------------------------------------
interface Stat {
  created: number;
  skipped: number;
  failed: number;
  disabled: boolean;
}
const stats: Record<string, Stat> = {};
function stat(model: string): Stat {
  return (stats[model] ??= { created: 0, skipped: 0, failed: 0, disabled: false });
}

/**
 * Run a write for `model`. If a write throws because the model/column is
 * unavailable on this DB (migration drift), mark the model disabled so we stop
 * hammering it, log once, and continue the rest of the seed.
 */
async function tryWrite(
  model: string,
  fn: () => Promise<"created" | "skipped">,
): Promise<void> {
  const s = stat(model);
  if (s.disabled) {
    s.skipped++;
    return;
  }
  try {
    const result = await fn();
    if (result === "created") s.created++;
    else s.skipped++;
  } catch (err) {
    s.failed++;
    // First failure for a model: warn and disable to avoid log spam. This keeps
    // a single broken model (missing column, etc.) from aborting the whole run.
    if (!s.disabled) {
      s.disabled = true;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ⚠️  [${model}] write failed — skipping remaining ${model} rows. Reason: ${msg.split("\n")[0]}`);
    }
  }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  console.log(`\n🌱 Leafnerd demo seed — synthetic population under org "${DEMO_ORG_SLUG}".\n`);

  // ----------------------------------------------------------------------
  // 1. Dedicated demo organization (upsert by deterministic slug).
  // ----------------------------------------------------------------------
  const org = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    update: { name: DEMO_ORG_NAME },
    create: {
      slug: DEMO_ORG_SLUG,
      name: DEMO_ORG_NAME,
      legalName: DEMO_ORG_NAME,
      brandName: "Leafnerd",
      state: "CA",
      timeZone: "America/Los_Angeles",
    },
  });
  console.log(`  ✓ Organization ${org.slug} (${org.id})\n`);

  const orgId = org.id;
  const now = new Date();

  // ----------------------------------------------------------------------
  // 2. Synthetic patients + their child clinical rows.
  // ----------------------------------------------------------------------
  for (let i = 0; i < PATIENT_COUNT; i++) {
    const seed = hash(`${DEMO_ORG_SLUG}:patient:${i}`);
    const r = rng(seed);

    const cohort = COHORTS[i % COHORTS.length];
    const firstName = pick(FIRST_NAMES, r());
    const lastName = pick(LAST_NAMES, r());
    const sex = r() < 0.5 ? "M" : "F";
    const age = intIn(r(), 38, 84);
    const birthYear = now.getFullYear() - age;
    const dob = new Date(Date.UTC(birthYear, intIn(r(), 0, 11), intIn(r(), 1, 28)));
    const [city, state, postalCode] = pick(CITIES, r());

    // Deterministic risk score around the cohort baseline.
    const score = round(Math.min(0.99, Math.max(0.2, cohort.baseRisk + (r() - 0.5) * 0.3)), 2);
    const hcc = round(1.1 + score * 3.2, 2);
    const gaps = intIn(r(), 0, 4);
    const source = pick(SOURCES, r());
    const matchConf = round(source === "Wearable" ? 0.65 + r() * 0.2 : 0.85 + r() * 0.14, 2);

    // Stable, per-org identity. Email is the idempotency key.
    const email = `ln-demo-${i}@${EMAIL_DOMAIN}`;
    const mrn = `LN-${40000 + i}`;

    // -- Patient (find-or-create by org+email) -------------------------------
    let patient = await prisma.patient
      .findFirst({ where: { organizationId: orgId, email } })
      .catch(() => null);

    if (!patient) {
      await tryWrite("Patient", async () => {
        patient = await prisma.patient.create({
          data: {
            organizationId: orgId,
            status: PatientStatus.active,
            firstName,
            lastName,
            dateOfBirth: dob,
            email,
            phone: `+1-555-${String(1000 + (i % 9000)).padStart(4, "0")}`,
            city,
            state,
            postalCode,
            presentingConcerns: cohort.condition,
            treatmentGoals: "Symptom reduction and improved daily function.",
            intakeAnswers: {
              cohort: cohort.label,
              mrn,
              riskScore: score,
              riskLevel: riskLevel(score),
              hcc,
              openGaps: gaps,
              identityMatch: matchConf,
              source,
              seedTag: "leafnerd-demo",
            } as Prisma.InputJsonValue,
          },
        });
        return "created";
      });
    } else {
      stat("Patient").skipped++;
    }

    if (!patient) continue; // Patient model unavailable — skip dependents.
    const pid = patient.id;

    // Skip all child rows if this patient already has encounters (idempotent).
    const alreadySeeded = await prisma.encounter
      .count({ where: { patientId: pid } })
      .then((c) => c > 0)
      .catch(() => false);
    if (alreadySeeded) {
      stat("Encounter").skipped++;
      continue;
    }

    // -- Encounters (1-2 recent visits) -------------------------------------
    const encCount = intIn(r(), 1, 2);
    for (let e = 0; e < encCount; e++) {
      const daysAgo = intIn(r(), 1, 40);
      const sched = new Date(now.getTime() - daysAgo * 86400000);
      await tryWrite("Encounter", async () => {
        await prisma.encounter.create({
          data: {
            organizationId: orgId,
            patientId: pid,
            status: EncounterStatus.complete,
            scheduledFor: sched,
            startedAt: sched,
            completedAt: new Date(sched.getTime() + 25 * 60000),
            chartingCompletedAt: new Date(sched.getTime() + 60 * 60000),
            modality: r() < 0.7 ? "in_person" : "video",
            placeOfService: r() < 0.7 ? "11" : "02",
            reason: cohort.condition,
          },
        });
        return "created";
      });
    }

    // -- Clinical observations (incl. HbA1c / BP values) --------------------
    // Every patient gets a BP reading; diabetes/CHF cohorts get an HbA1c.
    const sysBp = intIn(r(), 118, 168);
    const diaBp = intIn(r(), 72, 102);
    const bpHigh = sysBp >= 140 || diaBp >= 90;
    await tryWrite("ClinicalObservation", async () => {
      await prisma.clinicalObservation.create({
        data: {
          patientId: pid,
          observedBy: "leafnerd-demo-seed:1",
          observedByKind: "agent",
          category: ObservationCategory.symptom_trend,
          severity: bpHigh ? ObservationSeverity.notable : ObservationSeverity.info,
          summary: `Blood pressure ${sysBp}/${diaBp} mmHg recorded at last visit.`,
          evidence: { loinc: "85354-9", value: `${sysBp}/${diaBp}`, unit: "mmHg" } as Prisma.InputJsonValue,
          actionSuggested: bpHigh ? "Consider antihypertensive titration." : undefined,
        },
      });
      return "created";
    });

    if (cohort.key === "dm2" || cohort.key === "chfckd") {
      const a1c = round(6.0 + r() * 4.0, 1); // 6.0 .. 10.0
      const a1cHigh = a1c >= 8.0;
      await tryWrite("ClinicalObservation", async () => {
        await prisma.clinicalObservation.create({
          data: {
            patientId: pid,
            observedBy: "leafnerd-demo-seed:1",
            observedByKind: "agent",
            category: ObservationCategory.medication_response,
            severity: a1cHigh ? ObservationSeverity.concern : ObservationSeverity.info,
            summary: `HbA1c ${a1c}% — ${a1cHigh ? "above" : "near"} target.`,
            evidence: { loinc: "4548-4", value: a1c, unit: "%" } as Prisma.InputJsonValue,
            actionSuggested: a1cHigh ? "Overdue for glycemic recheck; flag care gap." : undefined,
          },
        });
        return "created";
      });
    }

    // -- Past medical condition (the cohort's defining dx) ------------------
    await tryWrite("PastMedicalCondition", async () => {
      await prisma.pastMedicalCondition.create({
        data: {
          patientId: pid,
          condition: cohort.condition,
          onsetYear: intIn(r(), cohort.onsetBase, 2025),
          source: "imported",
          notes: `Synthetic ${cohort.label} cohort member for the Leafnerd demo.`,
        },
      });
      return "created";
    });

    // -- Patient medications (cohort meds; some carry unmapped local codes) -
    for (const med of cohort.meds) {
      await tryWrite("PatientMedication", async () => {
        await prisma.patientMedication.create({
          data: {
            patientId: pid,
            name: med.name,
            genericName: med.generic,
            type: med.generic.includes("cannab") ? MedicationType.cannabis : MedicationType.prescription,
            dosage: med.dosage,
            prescriber: "Dr. Reyes (demo)",
            active: true,
            startDate: new Date(now.getTime() - intIn(r(), 30, 700) * 86400000),
            // The "unmapped" slice mirrors the prototype's MTF1000 local-code
            // MedicationRequest that fails RxNorm mapping.
            notes: med.unmapped
              ? `local vocab '${med.unmapped}' · RxNorm mapping confidence < 0.6 (unmapped)`
              : undefined,
          },
        });
        return "created";
      });
    }

    if ((i + 1) % 200 === 0) {
      console.log(`  … processed ${i + 1}/${PATIENT_COUNT} patients`);
    }
  }

  // ----------------------------------------------------------------------
  // 3. Flagged claims + scrub results (~40) so the Claims surface has real
  //    anomalies. Each attaches to one of the demo patients.
  // ----------------------------------------------------------------------
  console.log(`\n  Generating ${FLAGGED_CLAIM_COUNT} flagged claims…`);

  const demoPatients = await prisma.patient
    .findMany({
      where: { organizationId: orgId, email: { endsWith: `@${EMAIL_DOMAIN}` } },
      select: { id: true },
      take: FLAGGED_CLAIM_COUNT,
      orderBy: { createdAt: "asc" },
    })
    .catch(() => [] as { id: string }[]);

  const PAYERS = ["Blue Cross Blue Shield", "Aetna", "UnitedHealthcare", "Medicare Advantage", "Cigna"];
  const SCRUB_ISSUES: { rule: string; message: string; severity: string }[] = [
    { rule: "MODIFIER_25", message: "Modifier -25 required on E/M with same-day procedure.", severity: "warning" },
    { rule: "NCCI_PTP", message: "NCCI procedure-to-procedure conflict between 80053 and 80048.", severity: "blocked" },
    { rule: "DX_SPECIFICITY", message: "ICD-10 code lacks required laterality/specificity.", severity: "warning" },
    { rule: "MISSING_RENDERING_NPI", message: "Rendering provider NPI absent on 837P loop 2310B.", severity: "blocked" },
    { rule: "UNITS_MUE", message: "Billed units exceed Medically Unlikely Edit threshold.", severity: "warning" },
  ];

  for (let i = 0; i < demoPatients.length; i++) {
    const p = demoPatients[i];
    const r = rng(hash(`${DEMO_ORG_SLUG}:claim:${i}`));
    const issue = pick(SCRUB_ISSUES, r());
    const blocking = issue.severity === "blocked";
    const claimNumber = `LN-CLM-${String(1000 + i)}`;
    const serviceDate = new Date(now.getTime() - intIn(r(), 1, 25) * 86400000);
    const billedCents = intIn(r(), 8000, 42000);

    // Idempotent: skip if a claim with this internal number already exists.
    const existing = await prisma.claim
      .findFirst({ where: { organizationId: orgId, claimNumber }, select: { id: true } })
      .catch(() => null);
    if (existing) {
      stat("Claim").skipped++;
      // Ensure a scrub result exists for it too.
      const hasScrub = await prisma.claimScrubResult
        .count({ where: { claimId: existing.id } })
        .then((c) => c > 0)
        .catch(() => true);
      if (!hasScrub) {
        await tryWrite("ClaimScrubResult", async () => {
          await writeScrub(existing.id, issue, blocking);
          return "created";
        });
      } else {
        stat("ClaimScrubResult").skipped++;
      }
      continue;
    }

    let claimId: string | null = null;
    await tryWrite("Claim", async () => {
      const claim = await prisma.claim.create({
        data: {
          organizationId: orgId,
          patientId: p.id,
          status: blocking ? ClaimStatus.scrub_blocked : ClaimStatus.scrubbing,
          cptCodes: [
            { code: "99214", label: "Office visit, established, moderate", units: 1, chargeAmount: billedCents / 100 },
          ] as Prisma.InputJsonValue,
          icd10Codes: [{ code: "E11.9", label: "Type 2 diabetes mellitus without complications" }] as Prisma.InputJsonValue,
          billedAmountCents: billedCents,
          payerName: pick(PAYERS, r()),
          claimNumber,
          placeOfService: "11",
          frequencyCode: "1",
          serviceDate,
          scrubbedAt: now,
          scrubIssues: [{ ruleId: issue.rule, severity: issue.severity, message: issue.message }] as Prisma.InputJsonValue,
        },
      });
      claimId = claim.id;
      return "created";
    });

    if (claimId) {
      await tryWrite("ClaimScrubResult", async () => {
        await writeScrub(claimId as string, issue, blocking);
        return "created";
      });
    }
  }

  // ----------------------------------------------------------------------
  // 4. Summary
  // ----------------------------------------------------------------------
  console.log(`\n📊 Seed summary (org "${DEMO_ORG_SLUG}"):`);
  for (const [model, s] of Object.entries(stats)) {
    const flag = s.disabled ? "  [DISABLED — migration drift?]" : "";
    console.log(
      `  ${model.padEnd(22)} created=${String(s.created).padStart(5)}  skipped=${String(s.skipped).padStart(5)}  failed=${String(s.failed).padStart(3)}${flag}`,
    );
  }
  console.log(`\n✅ Done. All rows tagged to org ${orgId}.\n`);
}

/** Write a ClaimScrubResult for a claim. Mirrors the prototype's edit shapes. */
async function writeScrub(
  claimId: string,
  issue: { rule: string; message: string; severity: string },
  blocking: boolean,
): Promise<void> {
  await prisma.claimScrubResult.create({
    data: {
      claimId,
      scrubVersion: "leafnerd-demo-scrub:1",
      status: blocking ? ScrubStatus.blocked : ScrubStatus.warnings,
      edits: [
        {
          ruleId: issue.rule,
          severity: issue.severity,
          message: issue.message,
          lineSequence: 1,
          autoFixApplied: false,
        },
      ] as Prisma.InputJsonValue,
      ncciConflicts: (issue.rule === "NCCI_PTP"
        ? [{ column1: "80053", column2: "80048", modifierAllowed: false }]
        : []) as Prisma.InputJsonValue,
      modifierWarnings: (issue.rule === "MODIFIER_25"
        ? [{ code: "99214", missingModifier: "25" }]
        : []) as Prisma.InputJsonValue,
      missingFields: (issue.rule === "MISSING_RENDERING_NPI"
        ? ["renderingNpi"]
        : []) as Prisma.InputJsonValue,
    },
  });
}

main()
  .catch((err) => {
    console.error("Seed failed (top-level):", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
