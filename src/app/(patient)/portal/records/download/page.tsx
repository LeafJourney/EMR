import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { ChartDownloadClient } from "../../../../(clinician)/clinic/patients/[id]/download/download-client";

export const metadata = { title: "Download my chart" };
export const dynamic = "force-dynamic";

/**
 * Patient self-service chart download. Patients can export their own
 * complete record at any time — HIPAA right of access. The underlying
 * API enforces ownership (Patient.userId === user.id) so this surface
 * just resolves the caller's own patient row before rendering the
 * picker.
 */
export default async function PatientChartDownloadPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!patient) {
    redirect("/portal/intake");
  }

  const counts = await Promise.all([
    prisma.patientMedication.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.dosingRegimen.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.outcomeLog.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.assessmentResponse.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.encounter.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.note.count({ where: { encounter: { patientId: patient.id } } }).catch(() => null),
    prisma.labResult.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.document.count({ where: { patientId: patient.id, deletedAt: null } }).catch(() => null),
    prisma.patientMemory.count({ where: { patientId: patient.id, validUntil: null } }).catch(() => null),
  ]);

  const [
    medicationCount,
    regimenCount,
    outcomeCount,
    assessmentCount,
    encounterCount,
    noteCount,
    labCount,
    documentCount,
    memoryCount,
  ] = counts;

  const sectionCounts: { key: any; count: number | null }[] = [
    { key: "demographics", count: 1 },
    { key: "allergies", count: null },
    { key: "problems", count: null },
    { key: "medications", count: medicationCount },
    { key: "dosing", count: regimenCount },
    { key: "outcomes", count: outcomeCount },
    { key: "assessments", count: assessmentCount },
    { key: "notes", count: noteCount },
    { key: "labs", count: labCount },
    { key: "documents", count: documentCount },
    { key: "encounters", count: encounterCount },
    { key: "memories", count: memoryCount },
  ];

  return (
    <PageShell maxWidth="max-w-[1000px]">
      <PageHeader
        eyebrow="Your records"
        title="Download my chart"
        description="Take a complete copy of your chart with you. The .lfj file is structured for transfer between systems; the printable version saves cleanly as a PDF you can mail, store, or hand to another provider."
      />
      <ChartDownloadClient
        patientId={patient.id}
        patientName={`${patient.firstName} ${patient.lastName}`.trim()}
        patientChartId={patient.id}
        backHref="/portal/records"
        apiBase={`/api/patients/${patient.id}/export`}
        sectionCounts={sectionCounts}
      />
    </PageShell>
  );
}
