import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { EducationView } from "./education-view";
import { ComboWheelShell } from "@/components/education/combo-wheel-shell";
import { KanderResources } from "@/components/education/kander-resources";

export const metadata = { title: "My Care Guide" };

// ---------------------------------------------------------------------------
// Patient Education Sheet (EMR-66 / EMR-110)
// ---------------------------------------------------------------------------
// AI-generated personalized education sheet based on the patient's
// conditions, medications, and care plan. Printable PDF. Age-appropriate
// language (3rd-grade reading level).
// ---------------------------------------------------------------------------

export default async function EducationPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, firstName: true },
  });

  if (!patient) redirect("/portal/intake");

  return (
    <PageShell maxWidth="max-w-[860px]">
      <PatientSectionNav section="health" />
      <div className="mb-10 text-center print:hidden">
        <Eyebrow className="justify-center mb-3">Your care guide</Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight">
          {patient.firstName}&apos;s Care Guide
        </h1>
        <p className="text-sm text-text-muted mt-3 max-w-md mx-auto leading-relaxed">
          A personalized education sheet built from your care plan, medications,
          and health goals. Written in plain language so everything is clear.
        </p>
      </div>

      <EducationView />

      <div className="mt-12 space-y-12 print:hidden">
        <ComboWheelShell />
        <KanderResources />
      </div>
    </PageShell>
  );
}
