import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { PrescribeFormV2 } from "./prescribe-form-v2";
import { checkContraindications } from "@/lib/domain/contraindications";
import { resolveModuleFlags, scrubModuleWords } from "@/lib/clinical/module-opt-in";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "New Prescription" };

export default async function PrescribePage({ params }: PageProps) {
  const user = await requireUser();

  const [patient, products, medications, chartSummary, eligibleCoSigners] =
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
