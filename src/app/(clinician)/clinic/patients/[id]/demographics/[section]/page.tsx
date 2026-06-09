import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import { DemographicsDetailEditor } from "./detail-editor";

interface PageProps {
  params: { id: string; section: string };
}

const SECTIONS: Record<
  string,
  { title: string; fields: { key: string; label: string; placeholder?: string }[] }
> = {
  identity: {
    title: "Identity",
    fields: [
      { key: "ssn", label: "Social Security Number", placeholder: "XXX-XX-XXXX" },
      { key: "preferredName", label: "Preferred name" },
      { key: "pronouns", label: "Pronouns" },
      { key: "languages", label: "Preferred language(s)" },
    ],
  },
  contact: {
    title: "Contact",
    fields: [
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address" },
      { key: "emergencyName", label: "Emergency contact name" },
      { key: "emergencyNumber", label: "Emergency contact number" },
      { key: "emergencyEmail", label: "Emergency contact email" },
    ],
  },
  insurance: {
    title: "Insurance",
    fields: [
      { key: "planName", label: "Plan name" },
      { key: "memberId", label: "Member ID" },
      { key: "groupNumber", label: "Group number" },
      { key: "coordinationOfBenefits", label: "Coordination of benefits" },
    ],
  },
};

export default async function DemographicsSectionPage({ params }: PageProps) {
  const user = await requireUser();
  const section = SECTIONS[params.section];
  if (!section) notFound();

  const patient = await prisma.patient.findFirst({
    where: { id: params.id, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) notFound();

  // Seed core values we already hold so the editor isn't empty on first open.
  const intake = (patient.intakeAnswers ?? {}) as Record<string, any>;
  const seed: Record<string, string> = {
    phone: patient.phone ?? "",
    email: patient.email ?? "",
    address: [patient.addressLine1, patient.city, patient.state, patient.postalCode]
      .filter(Boolean)
      .join(", "),
    planName:
      (intake.insurance as any)?.providerName ??
      (typeof intake.insurance === "string" ? intake.insurance : "") ??
      "",
    memberId: (intake.insurance as any)?.memberId ?? intake.memberId ?? "",
  };

  return (
    <PageShell maxWidth="max-w-[840px]">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Avatar firstName={patient.firstName} lastName={patient.lastName} size="lg" />
          <div>
            <Eyebrow className="mb-2">{section.title}</Eyebrow>
            <h1 className="font-display text-2xl text-text tracking-tight">
              {section.title} — {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Add, edit, or erase {section.title.toLowerCase()} information.
            </p>
          </div>
        </div>
        <Link href={`/clinic/patients/${params.id}?tab=demographics`}>
          <Button variant="secondary" size="sm">
            Back to chart
          </Button>
        </Link>
      </div>

      <DemographicsDetailEditor
        patientId={params.id}
        section={params.section}
        fields={section.fields}
        seed={seed}
        patientLifeNumber={patient.id.slice(0, 12).toUpperCase()}
      />
    </PageShell>
  );
}
