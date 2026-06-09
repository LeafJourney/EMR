import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import {
  PrescribeFormV2,
  type DiagnosisOption,
  type RecommendationPrefill,
} from "./prescribe-form-v2";
import { checkContraindications } from "@/lib/domain/contraindications";
import { resolveModuleFlags, scrubModuleWords } from "@/lib/clinical/module-opt-in";
import { COMMON_PROBLEMS } from "@/lib/domain/problem-list";

interface PageProps {
  params: { id: string };
  // EMR-1098 (M2): ?rec={CannabisRecommendation.id} pre-fills the form from a
  // saved AI recommendation.
  searchParams?: { rec?: string };
}

export const metadata = { title: "New Prescription" };

export default async function PrescribePage({ params, searchParams }: PageProps) {
  const user = await requireUser();

  const [patient, products, medications, chartSummary, problemListConditions, eligibleCoSigners] =
    await Promise.all([
      prisma.patient.findFirst({
        where: {
          id: params.id,
          organizationId: user.organizationId!,
          deletedAt: null,
        },
      }),
      prisma.cannabisProduct.findMany({
        where: { organizationId: user.organizationId!, active: true },
        orderBy: { name: "asc" },
      }),
      prisma.patientMedication.findMany({
        where: { patientId: params.id, active: true },
        orderBy: { name: "asc" },
      }),
      prisma.chartSummary.findUnique({
        where: { patientId: params.id },
      }),
      // EMR-1099 (M4): the patient's documented diagnoses (problem list).
      // Rows store "ICD10 | description" in `condition` (see problems/page.tsx).
      prisma.pastMedicalCondition.findMany({
        where: { patientId: params.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
      }),
      // EMR-088: optional dual sign-off — list other clinicians/owners in the
      // org so the prescriber can route a high-risk override for co-signature.
      prisma.user.findMany({
        where: {
          id: { not: user.id },
          memberships: {
            some: {
              organizationId: user.organizationId!,
              role: { in: ["clinician", "practice_owner"] },
            },
          },
        },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
    ]);

  if (!patient) notFound();

  // EMR-1098 (M2): load the saved recommendation referenced by ?rec= and map
  // its payload onto the form's initial values. The catch keeps the page up
  // while the CannabisRecommendation table migration is still rolling out.
  const savedRecommendation = searchParams?.rec
    ? await prisma.cannabisRecommendation
        .findFirst({
          where: {
            id: searchParams.rec,
            patientId: params.id,
            organizationId: user.organizationId!,
          },
        })
        .catch(() => null)
    : null;

  const recommendationPrefill: RecommendationPrefill | null = savedRecommendation
    ? buildRecommendationPrefill(
        savedRecommendation.id,
        savedRecommendation.createdAt,
        savedRecommendation.recommendation as Record<string, unknown>,
      )
    : null;

  // EMR-1099 (M4): diagnosis-code options for the prescription — the patient's
  // documented problem list first, then the common cannabis-context codes
  // (same pattern as the referral form's diagnosis picker).
  const chartDiagnoses: DiagnosisOption[] = problemListConditions
    .map((c) => {
      if (!c.condition.includes(" | ")) return null;
      const [code, ...rest] = c.condition.split(" | ");
      if (!code.trim()) return null;
      return { code: code.trim(), label: rest.join(" | ").trim(), fromChart: true };
    })
    .filter((d): d is DiagnosisOption => d !== null);
  const chartCodes = new Set(chartDiagnoses.map((d) => d.code));
  const diagnosisOptions: DiagnosisOption[] = [
    ...chartDiagnoses,
    ...COMMON_PROBLEMS.filter((p) => !chartCodes.has(p.icd10)).map((p) => ({
      code: p.icd10,
      label: p.description,
      fromChart: false,
    })),
  ];

  // EMR-088: run cannabis contraindication check
  const contraindicationMatches = checkContraindications({
    dateOfBirth: patient.dateOfBirth,
    presentingConcerns: patient.presentingConcerns,
    intakeAnswers: patient.intakeAnswers,
    medicationNames: medications.map((m) => m.name),
    historyText: chartSummary?.summaryMd ?? null,
    icd10Codes: [], // Could pull from problem list when we have one
  });

  const patientState = patient.state ?? undefined;

  // EMR-883 — module gating. Cannabis is on by default for LeafJourney, but
  // when the org has opted out we scrub the word "Cannabis" from titles and
  // gate the psilocybin medication class on its own opt-in flag (EMR-885).
  const moduleFlags = resolveModuleFlags({
    hasCannabisFormulary: products.length > 0,
  });

  // EMR-889 — controlled-substance prescribing surfaces the provider's DEA
  // number. We don't have a column for it (no schema changes), so derive a
  // stable placeholder from the user id; the settings page is where a real
  // value would be stored interim.
  const providerName = `${user.firstName} ${user.lastName}`.trim() || "Prescriber";
  const deaNumber = deriveDeaPlaceholder(providerName);

  return (
    <PageShell maxWidth="max-w-[1180px]">
      <PrescribeFormV2
        patientId={params.id}
        patientFirstName={patient.firstName}
        patientLastName={patient.lastName}
        patientEmail={patient.email}
        patientPhone={patient.phone}
        patientPhotoUrl={null}
        patientState={patientState}
        providerName={providerName}
        deaNumber={deaNumber}
        moduleFlags={moduleFlags}
        // EMR-883 — drop "Cannabis" from the heading when the module is off.
        heading={scrubModuleWords("New Cannabis Prescription", moduleFlags)}
        recommendationPrefill={recommendationPrefill}
        diagnosisOptions={diagnosisOptions}
        contraindicationMatches={contraindicationMatches.map((m) => ({
          id: m.contraindication.id,
          label: m.contraindication.label,
          severity: m.contraindication.severity,
          rationale: m.contraindication.rationale,
          requiresOverride: m.contraindication.requiresOverride,
          matchedOn: m.matchedOn,
        }))}
        eligibleCoSigners={eligibleCoSigners.map((u) => ({
          id: u.id,
          label: `${u.firstName} ${u.lastName}`.trim(),
        }))}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          brand: p.brand,
          productType: p.productType,
          route: p.route,
          thcConcentration: p.thcConcentration,
          cbdConcentration: p.cbdConcentration,
          cbnConcentration: p.cbnConcentration,
          cbgConcentration: p.cbgConcentration,
          thcCbdRatio: p.thcCbdRatio,
          concentrationUnit: p.concentrationUnit,
        }))}
        medications={medications.map((m) => ({
          id: m.id,
          name: m.name,
          genericName: m.genericName,
          dosage: m.dosage,
          active: m.active,
        }))}
      />
    </PageShell>
  );
}

/**
 * EMR-889 — interim DEA-number derivation. A real DEA number is 2 letters +
 * 7 digits with a checksum; we synthesize a deterministic, clearly-fake value
 * from the provider name so the controlled-substance preview has something to
 * show until a verified DEA registration is stored.
 */
function deriveDeaPlaceholder(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 10_000_000;
  const first = (name[0] ?? "X").toUpperCase();
  return `B${first}${hash.toString().padStart(7, "0")}`;
}

/**
 * EMR-1098 (M2) — map a saved recommendation payload (free-text, evidence
 * oriented) onto the prescribe form's structured fields. Conservative: dose
 * takes the LOW end of any range ("start low, go slow"), and anything that
 * can't be parsed is left for the physician — the raw payload is always shown
 * in the "Pre-filled from recommendation" note.
 */
function buildRecommendationPrefill(
  id: string,
  createdAt: Date,
  payload: Record<string, unknown>,
): RecommendationPrefill {
  const productType = typeof payload.productType === "string" ? payload.productType : "";
  const startingDose = typeof payload.startingDoseMg === "string" ? payload.startingDoseMg : "";
  const frequency = typeof payload.frequency === "string" ? payload.frequency : "";

  // "2.5-5 mg THC + 2.5-5 mg CBD" → dose "2.5", unit "mg"
  const doseMatch = startingDose.match(/(\d+(?:\.\d+)?)/);
  const unitMatch = startingDose.match(/\d\s*(mg|mcg|g|mL)\b/i);

  // "1-2 times daily" → 1; "Once nightly" → 1; "twice daily" → 2; "3x" → 3
  let frequencyPerDay: number | null = null;
  const freqLower = frequency.toLowerCase();
  if (/\bonce\b|\bnightly\b/.test(freqLower)) frequencyPerDay = 1;
  else if (/\btwice\b/.test(freqLower)) frequencyPerDay = 2;
  else {
    const m = freqLower.match(/(\d+)(?:\s*[-–]\s*\d+)?\s*(?:x\b|times)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 12) frequencyPerDay = n;
    }
  }

  // The qualifier after the first comma is timing guidance,
  // e.g. "Once nightly, 1 hour before bed" → "1 hour before bed".
  const commaIdx = frequency.indexOf(",");
  const timingInstructions =
    commaIdx >= 0 ? frequency.slice(commaIdx + 1).trim() || null : null;

  return {
    id,
    createdAt: createdAt.toISOString(),
    productType,
    dose: doseMatch ? doseMatch[1] : null,
    unit: unitMatch ? unitMatch[1] : null,
    frequencyPerDay,
    timingInstructions,
    summary: {
      productType,
      cannabinoidRatio:
        typeof payload.cannabinoidRatio === "string" ? payload.cannabinoidRatio : "",
      startingDoseMg: startingDose,
      deliveryMethod:
        typeof payload.deliveryMethod === "string" ? payload.deliveryMethod : "",
      frequency,
    },
  };
}
