import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import { ProblemListView } from "./problem-list-view";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "Problem List" };

export default async function ProblemListPage({ params }: PageProps) {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });

  if (!patient) notFound();

  const providerName = `${user.firstName} ${user.lastName}`;

  // Query conditions from database
  const dbConditions = await prisma.pastMedicalCondition.findMany({
    where: {
      patientId: params.id,
      deletedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  // Map database rows to ProblemListEntry interface
  const initialProblems = dbConditions.map((c) => {
    let icd10 = "";
    let description = c.condition;

    if (c.condition.includes(" | ")) {
      const parts = c.condition.split(" | ");
      icd10 = parts[0];
      description = parts.slice(1).join(" | ");
    }

    let status: any = "active";
    let onsetDate: string | undefined = undefined;
    let resolvedDate: string | undefined = undefined;
    let notesText: string | undefined = undefined;
    let addedBy = providerName;
    let addedAt = c.createdAt.toISOString();

    if (c.notes?.startsWith("{")) {
      try {
        const parsed = JSON.parse(c.notes);
        status = parsed.status ?? "active";
        onsetDate = parsed.onsetDate ?? undefined;
        resolvedDate = parsed.resolvedDate ?? undefined;
        notesText = parsed.notes ?? undefined;
        addedBy = parsed.addedBy ?? providerName;
        addedAt = parsed.addedAt ?? c.createdAt.toISOString();
      } catch {
        notesText = c.notes;
      }
    } else {
      notesText = c.notes ?? undefined;
    }

    return {
      id: c.id,
      icd10,
      description,
      status,
      onsetDate,
      resolvedDate,
      notes: notesText,
      addedBy,
      addedAt,
    };
  });

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
            <Eyebrow className="mb-2">Problem list</Eyebrow>
            <h1 className="font-display text-2xl text-text tracking-tight">
              Problems for {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Structured diagnoses, status, and notes.
            </p>
          </div>
        </div>
        <Link href={`/clinic/patients/${params.id}`}>
          <Button variant="secondary" size="sm">
            Back to chart
          </Button>
        </Link>
      </div>

      <ProblemListView
        patientId={params.id}
        providerName={providerName}
        initialProblems={initialProblems}
      />
    </PageShell>
  );
}
