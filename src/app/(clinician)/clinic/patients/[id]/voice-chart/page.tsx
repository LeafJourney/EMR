import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { VoiceRecorder } from "./voice-recorder";

interface PageProps {
  params: { id: string };
}

export default async function VoiceChartPage({ params }: PageProps) {
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
      dateOfBirth: true,
      presentingConcerns: true,
      treatmentGoals: true,
    },
  });

  if (!patient) notFound();

  // Fetch the most recent finalized notes to extract Last Visit summary bullet points
  const priorNotes = await prisma.note.findMany({
    where: {
      encounter: {
        patientId: params.id,
      },
      status: "finalized",
    },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      narrative: true,
    },
  });

  const lastVisitBullets: string[] = [];
  for (const note of priorNotes) {
    if (note.narrative) {
      const lines = note.narrative.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        // Match standard markdown bullet characters
        if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
          const content = trimmed.replace(/^[-*\s]+/, "");
          if (content && !lastVisitBullets.includes(content)) {
            lastVisitBullets.push(content);
          }
        }
      }
    }
  }

  // Fallback bullet if no summary notes exist yet
  if (lastVisitBullets.length === 0) {
    lastVisitBullets.push("No prior visit summary bullets documented.");
  }

  const patientName = `${patient.firstName} ${patient.lastName}`;

  // Format DOB as MM-DD-YYYY
  let formattedDob = null;
  if (patient.dateOfBirth) {
    const d = patient.dateOfBirth;
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const year = d.getUTCFullYear();
    formattedDob = `${month}-${day}-${year}`;
  }

  return (
    <PageShell>
      <div className="mb-6">
        <Link
          href={`/clinic/patients/${patient.id}`}
          className="text-sm text-text-muted hover:text-accent transition-colors duration-200"
        >
          &larr; Back to {patientName}&apos;s chart
        </Link>
      </div>

      <PageHeader
        eyebrow="Voice-to-Chart"
        title="Ambient Documentation"
        description={`Record the visit with ${patientName} and let AI extract structured clinical notes.`}
      />

      <VoiceRecorder
        patientId={patient.id}
        patientName={patientName}
        patientDob={formattedDob}
        presentingConcerns={patient.presentingConcerns}
        treatmentGoals={patient.treatmentGoals}
        lastVisitBullets={lastVisitBullets}
      />
    </PageShell>

  );
}
