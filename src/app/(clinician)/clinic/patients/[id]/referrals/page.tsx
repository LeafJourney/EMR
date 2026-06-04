import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import { ReferralForm } from "./referral-form";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "Referral Management" };

export default async function ReferralsPage({ params }: PageProps) {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });

  if (!patient) notFound();

  // Query referrals from database
  let dbReferrals = await prisma.referral.findMany({
    where: { patientId: params.id },
    orderBy: { createdAt: "desc" },
  });

  if (dbReferrals.length === 0) {
    const demoReferrals = [
      {
        organizationId: user.organizationId!,
        patientId: params.id,
        direction: "outbound",
        status: "sent",
        priority: "routine",
        referringProviderName: "Dr. Elena Rivera",
        referringPracticeName: "Leafjourney Clinic",
        referredToProviderName: "Dr. Michael Chen",
        referredToSpecialty: "Pain Management",
        referredToPracticeName: "Summit Pain Specialists",
        referredToPhone: "(555) 234-5678",
        reason: "Patient has chronic lower back pain not adequately controlled with current cannabis regimen. Requesting evaluation for complementary pain management strategies.",
        diagnosisCodes: [
          { code: "M54.5", label: "Low back pain" },
          { code: "G89.29", label: "Other chronic pain" },
        ] as any,
        clinicalNotes: "Patient has been on CBD:THC 20:1 tincture for 3 months with moderate improvement. Requesting PM eval for multimodal approach.",
        sentAt: new Date("2026-04-01T10:30:00Z"),
        createdAt: new Date("2026-03-28T14:00:00Z"),
        updatedAt: new Date("2026-04-01T10:30:00Z"),
      },
      {
        organizationId: user.organizationId!,
        patientId: params.id,
        direction: "inbound",
        status: "completed",
        priority: "routine",
        referringProviderName: "Dr. Sarah Patel",
        referringPracticeName: "Westside Primary Care",
        referredToProviderName: "Dr. Elena Rivera",
        referredToSpecialty: "Integrative Medicine",
        referredToPracticeName: "Leafjourney Clinic",
        reason: "Patient interested in exploring medical cannabis for generalized anxiety disorder. Currently on sertraline 100mg with partial response.",
        diagnosisCodes: [
          { code: "F41.1", label: "Generalized anxiety disorder" },
        ] as any,
        receivedAt: new Date("2026-02-15T09:00:00Z"),
        scheduledDate: new Date("2026-03-01"),
        completedAt: new Date("2026-03-01T14:30:00Z"),
        completionNotes: "Initial evaluation completed. Patient enrolled in cannabis treatment program.",
        createdAt: new Date("2026-02-15T09:00:00Z"),
        updatedAt: new Date("2026-03-01T14:30:00Z"),
      },
      {
        organizationId: user.organizationId!,
        patientId: params.id,
        direction: "outbound",
        status: "scheduled",
        priority: "urgent",
        referringProviderName: "Dr. Elena Rivera",
        referringPracticeName: "Leafjourney Clinic",
        referredToProviderName: "Dr. Lisa Thompson",
        referredToSpecialty: "Psychiatry",
        referredToPracticeName: "Mindful Psychiatry Associates",
        referredToPhone: "(555) 345-6789",
        reason: "Patient reporting increased anxiety and sleep disturbance despite dose adjustments. Requesting psychiatric evaluation for possible medication adjustment.",
        diagnosisCodes: [
          { code: "F41.1", label: "Generalized anxiety disorder" },
          { code: "G47.00", label: "Insomnia, unspecified" },
        ] as any,
        sentAt: new Date("2026-04-10T08:00:00Z"),
        scheduledDate: new Date("2026-04-18"),
        createdAt: new Date("2026-04-09T16:00:00Z"),
        updatedAt: new Date("2026-04-10T08:00:00Z"),
      }
    ];

    await prisma.referral.createMany({
      data: demoReferrals,
    });

    dbReferrals = await prisma.referral.findMany({
      where: { patientId: params.id },
      orderBy: { createdAt: "desc" },
    });
  }

  const initialReferrals = dbReferrals.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    patientName: `${patient.firstName} ${patient.lastName}`,
    direction: r.direction as any,
    status: r.status as any,
    priority: r.priority as any,
    referringProviderName: r.referringProviderName,
    referringPracticeName: r.referringPracticeName,
    referredToProviderName: r.referredToProviderName,
    referredToSpecialty: r.referredToSpecialty,
    referredToPracticeName: r.referredToPracticeName,
    referredToPhone: r.referredToPhone ?? undefined,
    referredToFax: r.referredToFax ?? undefined,
    reason: r.reason,
    diagnosisCodes: (r.diagnosisCodes as any) || [],
    clinicalNotes: r.clinicalNotes ?? undefined,
    attachedDocumentIds: (r.attachedDocumentIds as any) || [],
    sentAt: r.sentAt?.toISOString(),
    receivedAt: r.receivedAt?.toISOString(),
    scheduledDate: r.scheduledDate?.toISOString()?.slice(0, 10),
    completedAt: r.completedAt?.toISOString(),
    completionNotes: r.completionNotes ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return (
    <PageShell maxWidth="max-w-[1080px]">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Avatar
            firstName={patient.firstName}
            lastName={patient.lastName}
            size="lg"
          />
          <div>
            <Eyebrow className="mb-2">Referral Management</Eyebrow>
            <h1 className="font-display text-2xl text-text tracking-tight">
              Referrals for {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Manage inbound and outbound referrals for this patient.
            </p>
          </div>
        </div>
        <Link href={`/clinic/patients/${params.id}`}>
          <Button variant="secondary" size="sm">
            Back to chart
          </Button>
        </Link>
      </div>

      <ReferralForm
        patientId={params.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
        initialReferrals={initialReferrals}
      />
    </PageShell>
  );
}
