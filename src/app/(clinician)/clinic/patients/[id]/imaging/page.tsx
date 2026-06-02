/**
 * Patient Imaging — Clinician Split View (EMR-164)
 *
 * Reading-room workspace inside the patient chart. Renders the radiologist
 * report on the left and the DICOM viewer on the right. The provider can
 * flip between studies and toggle the annotation overlay so they can read
 * the unmarked image, then compare to the marked one.
 *
 * Auth: org-scoped patient lookup against Prisma (same pattern as the
 * billing route). The imaging study/annotation/report data lives in the
 * in-memory Imaging Lab store (process-local, not in Prisma — see
 * `medical-imaging-store.ts` header for why).
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  getReportForStudy,
  listAnnotations,
  listStudies,
} from "@/lib/domain/medical-imaging-store";
import {
  type ImagingAnnotation,
  type RadiologyReport,
} from "@/lib/domain/medical-imaging";
import { ClinicianImagingWorkspace } from "@/components/imaging/clinician-imaging-workspace";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "Imaging" };

export default async function PatientImagingChartPage({ params }: PageProps) {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!patient) notFound();

  // Scope strictly to this patient's studies (EMR-806). Previously this fell
  // back to the DEMO_PATIENT_ID seed when a patient had none, which rendered
  // demo CT/MR studies attributed to a real patient — fabricated clinical
  // data in a doctor-live route. An empty list now renders an honest empty
  // workspace. This is the seam where a real PACS adapter slots in.
  const studies = listStudies(patient.id);

  const annotationsByStudy: Record<string, ImagingAnnotation[]> =
    Object.fromEntries(studies.map((s) => [s.id, listAnnotations(s.id)]));

  const reportsByStudy: Record<string, RadiologyReport> = Object.fromEntries(
    studies
      .map((s) => [s.id, getReportForStudy(s.id)] as const)
      .filter(
        (entry): entry is [string, RadiologyReport] => entry[1] !== null,
      ),
  );

  const authorName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Provider";

  return (
    <PageShell maxWidth="max-w-[1400px]">
      <PageHeader
        eyebrow={`${patient.firstName} ${patient.lastName} · Imaging`}
        title="Imaging"
        description="Radiologist report on the left, image on the right. Toggle the annotation overlay to compare the original read with what was marked."
      />
      <ClinicianImagingWorkspace
        patientId={patient.id}
        authorName={authorName}
        studies={studies}
        annotationsByStudy={annotationsByStudy}
        reportsByStudy={reportsByStudy}
      />
    </PageShell>
  );
}
