import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { canEditSection } from "@/lib/rbac/permissions";
import { PageShell } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import { DemographicsDetailEditor } from "./detail-editor";
import { MIRRORED_KEYS, SECTIONS } from "./sections";
import type { DemographicsExtraRow } from "./actions";

interface PageProps {
  params: { id: string; section: string };
}

export default async function DemographicsSectionPage({ params }: PageProps) {
  const user = await requireUser();
  const section = SECTIONS[params.section];
  if (!section) notFound();

  const patient = await prisma.patient.findFirst({
    where: { id: params.id, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) notFound();

  const intake = (patient.intakeAnswers ?? {}) as Record<string, any>;

  // Server-persisted section payload (written by saveDemographicsSection).
  const detail = (intake.demographicsDetail?.[params.section] ?? {}) as {
    fields?: Record<string, string>;
    extras?: DemographicsExtraRow[];
    savedAt?: string;
  };

  // Canonical values we already hold elsewhere on the chart. For mirrored
  // keys (phone/email, insurance identifiers) the canonical store wins so
  // this page can never drift from the inline-edit card, which writes to
  // the same fields. Non-mirrored keys (e.g. the address string) prefer
  // the persisted detail payload.
  const canonical: Record<string, string> = {
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
    groupNumber: (intake.insurance as any)?.groupNumber ?? "",
  };

  const mirrored = new Set(MIRRORED_KEYS[params.section] ?? []);
  const seed: Record<string, string> = { ...(detail.fields ?? {}) };
  for (const [key, value] of Object.entries(canonical)) {
    if (mirrored.has(key)) {
      seed[key] = value;
    } else if (!(key in seed) && value) {
      seed[key] = value;
    }
  }

  const canEdit = canEditSection(user, "demographics");

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
              {canEdit
                ? `Add, edit, or erase ${section.title.toLowerCase()} information.`
                : `View ${section.title.toLowerCase()} information (read-only for your role).`}
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
        initialExtras={detail.extras ?? []}
        initialSavedAt={detail.savedAt ?? null}
        canEdit={canEdit}
        patientLifeNumber={patient.id.slice(0, 12).toUpperCase()}
      />
    </PageShell>
  );
}
