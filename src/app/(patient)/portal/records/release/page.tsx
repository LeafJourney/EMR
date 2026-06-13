import Link from "next/link";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { recordReleaseFromRow } from "@/lib/domain/record-release";
import { RecordReleaseForm } from "@/components/portal/record-release-form";

export const metadata = { title: "Release records" };

export default async function ReleaseRecordsPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!patient) {
    return (
      <PageShell maxWidth="max-w-[960px]">
        <PatientSectionNav section="health" />
        <PageHeader
          eyebrow="Records"
          title="Release records"
          description="No patient profile found. Complete intake to enable record sharing."
        />
        <Link href="/portal/intake">
          <Button>Start intake</Button>
        </Link>
      </PageShell>
    );
  }

  const legalName = [patient.firstName, patient.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const releaseRows = await prisma.recordReleaseRequest.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
  });
  const initialHistory = releaseRows.map(recordReleaseFromRow);

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PatientSectionNav section="health" />
      <PageHeader
        eyebrow="Records"
        title="Send your records to another doctor"
        description="Authorize the practice to share your medical records with a provider you choose. You stay in control — every authorization expires in 12 months and you can revoke at any time."
        actions={
          <Link href="/portal/records">
            <Button variant="secondary">Back to records</Button>
          </Link>
        }
      />
      <RecordReleaseForm
        patientLegalName={legalName || null}
        initialHistory={initialHistory}
      />
    </PageShell>
  );
}
