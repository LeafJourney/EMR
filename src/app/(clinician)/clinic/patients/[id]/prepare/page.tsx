import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Eyebrow } from "@/components/ui/ornament";
import { BriefingConsole } from "./briefing-console";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "Prepare for Visit" };

export default async function PreparePage({ params }: PageProps) {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });

  if (!patient) notFound();

  return (
    <PageShell maxWidth="max-w-[860px]">
      <div className="mb-8">
        <Eyebrow className="mb-3">Meet Cindy – our AI Helper</Eyebrow>
        <div className="flex items-center gap-4">
          {/* Avatar prop set: { firstName, lastName, size, className }.
              The previous `imageUrl` prop never existed on the component —
              the patient model doesn't carry a profile picture either, so
              dropping the prop matches both the type and the data. (EMR-760) */}
          <Avatar
            firstName={patient.firstName}
            lastName={patient.lastName}
            size="lg"
          />
          <div>
            <h1 className="font-display text-3xl text-text tracking-tight">
              Prepare for {patient.firstName}&apos;s visit
            </h1>
            <p className="text-sm text-text-muted mt-1 max-w-xl">
              Take a deep breath! Cindy will review all {patient.firstName}&apos;s chart data, outcome trends, and research into a concise summary — so you walk in already knowing everything.
            </p>
          </div>
        </div>
      </div>

      <BriefingConsole
        patientId={params.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
      />
    </PageShell>
  );
}
