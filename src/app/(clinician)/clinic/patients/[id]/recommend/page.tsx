import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { Avatar } from "@/components/ui/avatar";
import { RecommendForm } from "./recommend-form";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "AI Recommendation" };

export default async function RecommendPage({ params }: PageProps) {
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
    <PageShell maxWidth="max-w-[800px]">
      <div className="mb-8">
        <Eyebrow className="mb-3">AI recommendation</Eyebrow>
        <div className="flex items-center gap-4">
          <Avatar
            firstName={patient.firstName}
            lastName={patient.lastName}
            size="lg"
          />
          <div>
            <h1 className="font-display text-3xl text-text tracking-tight">
              Treatment plan for {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Generate an evidence-based cannabis treatment recommendation using
              the patient&apos;s data and the research database.
            </p>
          </div>
        </div>
      </div>

      <RecommendForm
        patientId={params.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
        concerns={patient.presentingConcerns}
        goals={patient.treatmentGoals}
      />
    </PageShell>
  );
}
