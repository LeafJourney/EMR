import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { ChartDownloadClient } from "./download-client";

export const metadata = { title: "Download chart" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

/**
 * Clinician-facing chart download surface. Pre-counts each section so
 * the picker shows the operator how many rows they're about to export
 * before they pick a format.
 */
export default async function PatientChartDownloadPage({ params }: PageProps) {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!patient) notFound();

  // Lightweight count queries — these mirror the section catalog in
  // chart-export.ts so the UI can show "Notes (12)" before any data is
  // shipped. We do every count in parallel and tolerate failures
  // (defaulting to null so the UI just hides the count).
  const counts = await Promise.all([
    prisma.patientMedication.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.dosingRegimen.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.outcomeLog.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.assessmentResponse.count({ where: { patientId: patient.id } }).catch(() => null),
    prisma.encounter.count({ where: { patientId: patient.id, organizationId: user.organizationId! } }).catch(() => null),
    prisma.note.count({ where: { encounter: { patientId: patient.id, organizationId: user.organizationId! } } }).catch(() => null),
    prisma.labResult.count({ where: { patientId: patient.id, organizationId: user.organizationId! } }).catch(() => null),
    prisma.document.count({ where: { patientId: patient.id, organizationId: user.organizationId!, deletedAt: null } }).catch(() => null),
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
        eyebrow="Records release"
        title="Download chart"
        description="Export this patient's chart as a structured .lfj file (for backups or cross-EMR transfer) or as a printable PDF (for handouts, mail, CD, or flash drive)."
      />
      <ChartDownloadClient
        patientId={patient.id}
        patientName={`${patient.firstName} ${patient.lastName}`.trim()}
        patientChartId={patient.id}
        backHref={`/clinic/patients/${patient.id}`}
        apiBase={`/api/patients/${patient.id}/export`}
        sectionCounts={sectionCounts}
      />
    </PageShell>
  );
}
