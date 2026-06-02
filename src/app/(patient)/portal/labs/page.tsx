import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { getPatientLabPanels } from "@/lib/domain/lab-results-loader";
import { LabResultsView } from "./lab-results-view";

export const metadata = { title: "Lab Results" };

export default async function LabsPage() {
  const user = await requireRole("patient");

  // Real, patient-scoped labs only (EMR-806). The view used to render shared
  // demo panels for every patient.
  const patient = await prisma.patient.findFirst({
    where: { userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!patient) redirect("/portal/intake");

  const panels = await getPatientLabPanels(patient.id);

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="My Health"
        title="Lab Results"
        description="View your laboratory results, reference ranges, and cannabis-relevant interpretations."
      />
      <PatientSectionNav section="health" />
      <LabResultsView panels={panels} />
    </PageShell>
  );
}
