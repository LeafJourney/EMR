/**
 * My Imaging — Patient View (EMR-141)
 *
 * Read-only imaging gallery + radiologist report toggle. Only annotations
 * the provider explicitly released (`patientVisible` and not `critical`)
 * and reports flagged `releasedToPatient` are exposed. Critical findings
 * stay provider-side until the care team has reached the patient by phone.
 *
 * Adds a study date / modality filter and a "Download original" action
 * that produces a portable manifest the patient can share with another
 * provider.
 */

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
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
import { PatientImagingGallery } from "@/components/imaging/patient-imaging-gallery";

export const metadata = { title: "My Imaging" };

export default async function PatientImagingPage() {
  const user = await requireRole("patient");

  // Scope to the signed-in patient only (EMR-806). Previously this read the
  // shared demo store via DEMO_PATIENT_ID, so every patient saw the same
  // seeded studies — a cross-patient PHI bleed. A patient with no imaging now
  // gets an honest empty state from the gallery.
  const patient = await prisma.patient.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!patient) redirect("/portal/intake");

  const studies = listStudies(patient.id);

  const annotationsByStudy: Record<string, ImagingAnnotation[]> =
    Object.fromEntries(
      studies.map((s) => [
        s.id,
        listAnnotations(s.id, { patientVisibleOnly: true }),
      ]),
    );

  const reportsByStudy: Record<string, RadiologyReport> = Object.fromEntries(
    studies
      .map(
        (s) =>
          [
            s.id,
            getReportForStudy(s.id, { patientVisibleOnly: true }),
          ] as const,
      )
      .filter(
        (entry): entry is [string, RadiologyReport] => entry[1] !== null,
      ),
  );

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="My Records"
        title="My Imaging"
        description="Your CT, MRI, X-ray and ultrasound results — toggle between the picture and the plain-language report."
      />
      <PatientImagingGallery
        studies={studies}
        annotations={annotationsByStudy}
        reports={reportsByStudy}
      />
    </PageShell>
  );
}
