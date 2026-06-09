import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { Eyebrow } from "@/components/ui/ornament";
import { EmptyState } from "@/components/ui/empty-state";
import { MedicationWalletCard } from "../medications/wallet-card";
import { formatDate, formatDateOnly } from "@/lib/utils/format";

/**
 * Medication wallet card — EMR-112
 *
 * A standalone, printable surface that pulls a patient's current cannabis
 * regimens + non-cannabis medications + allergies into one wallet-sized
 * card. The same content is summoned from inside /portal/medications via
 * a button, but having a dedicated route gives the patient a stable
 * URL they can bookmark, AirDrop, or open from a paper QR code stuck on
 * their phone case in an emergency.
 *
 * The actual print layout lives in <MedicationWalletCard /> so we don't
 * duplicate the markup; this page is just the data fetch + page chrome.
 */

export const metadata = {
  title: "Medication wallet card",
  description:
    "A printable wallet card with your current cannabis regimens, prescriptions, and allergies for emergency reference.",
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  oil: "Oil",
  tincture: "Tincture",
  capsule: "Capsule",
  flower: "Flower",
  vape_cartridge: "Vape cart",
  edible: "Edible",
  topical: "Topical",
  suppository: "Suppository",
  spray: "Spray",
  other: "Product",
};

function frequencyLabel(perDay: number): string {
  if (perDay === 1) return "once daily";
  if (perDay === 2) return "twice daily";
  if (perDay === 3) return "three times daily";
  return `${perDay}× per day`;
}

export default async function WalletCardPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });

  if (!patient) {
    return (
      <PageShell maxWidth="max-w-[720px]">
        <PatientSectionNav section="health" />
        <EmptyState
          title="No patient profile yet"
          description="A patient record is created when you complete intake. Once that's done, your wallet card will populate here."
        />
      </PageShell>
    );
  }

  const [regimens, medications] = await Promise.all([
    prisma.dosingRegimen.findMany({
      where: { patientId: patient.id, active: true },
      include: { product: true },
      orderBy: { startDate: "desc" },
    }),
    prisma.patientMedication.findMany({
      where: { patientId: patient.id, active: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const cannabisRegimens = regimens.map((r) => {
    const product = r.product;
    const productLabel = product
      ? `${product.name} ${PRODUCT_TYPE_LABELS[product.productType] ?? ""}`.trim()
      : "Cannabis regimen";
    const dose =
      r.calculatedThcMgPerDose != null || r.calculatedCbdMgPerDose != null
        ? [
            r.calculatedThcMgPerDose != null
              ? `${r.calculatedThcMgPerDose.toFixed(1)}mg THC`
              : null,
            r.calculatedCbdMgPerDose != null
              ? `${r.calculatedCbdMgPerDose.toFixed(1)}mg CBD`
              : null,
          ]
            .filter(Boolean)
            .join(" + ")
        : `${r.volumePerDose} ${r.volumeUnit}`;
    return {
      productName: productLabel,
      dose,
      frequency: frequencyLabel(r.frequencyPerDay),
    };
  });

  const meds = medications.map((m) => ({
    name: m.name,
    dosage: m.dosage,
  }));

  const dob = patient.dateOfBirth ? formatDateOnly(patient.dateOfBirth) : null;
  const fullName = `${patient.firstName} ${patient.lastName}`.trim();

  return (
    <PageShell maxWidth="max-w-[720px]">
      <PatientSectionNav section="health" />

      <div className="mb-8">
        <Eyebrow className="mb-3">Wallet card</Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
          Carry your meds with you
        </h1>
        <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-2xl">
          A wallet-sized printable summary of your current cannabis regimen,
          other medications, and allergies. Useful for ER visits, travel, and
          handing off to a covering provider. Updated automatically whenever
          your care plan changes.
        </p>
      </div>

      {regimens.length === 0 && medications.length === 0 ? (
        <EmptyState
          title="Nothing to put on a card yet"
          description="Once you have an active medication or cannabis regimen, this card will populate. Until then, there's nothing to print."
        />
      ) : (
        <MedicationWalletCard
          patientName={fullName}
          dateOfBirth={dob}
          allergies={patient.allergies ?? []}
          medications={meds}
          cannabisRegimens={cannabisRegimens}
        />
      )}

      <p className="mt-6 text-[12px] text-text-subtle">
        This card is a personal summary, not a prescription. Always defer to
        your care team for clinical decisions.
      </p>
    </PageShell>
  );
}
