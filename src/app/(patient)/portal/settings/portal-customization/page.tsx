import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { CustomizationEditor } from "./customization-editor";

export const metadata = { title: "Portal customization" };

// ---------------------------------------------------------------------------
// EMR-073 — Customizable Patient Portal
//
// Lets the patient reorder which widgets show on their portal home, hide the
// ones they never look at, and pick an accent palette. The math lives in
// `@/lib/portal/customization` so the same shape can move to Prisma later.
// ---------------------------------------------------------------------------

export default async function PortalCustomizationPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) redirect("/portal/intake");

  return (
    <PageShell maxWidth="max-w-[920px]">
      <PageHeader
        eyebrow="Account"
        title="Customize your portal"
        description="Pick an accent palette, reorder your portal home, and hide what you do not use."
      />
      <PatientSectionNav section="account" />

      <p className="text-sm text-text-muted mb-6">
        Preferences are saved locally to this device.{" "}
        <Link href="/portal/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </p>

      <CustomizationEditor patientId={patient.id} />
    </PageShell>
  );
}
