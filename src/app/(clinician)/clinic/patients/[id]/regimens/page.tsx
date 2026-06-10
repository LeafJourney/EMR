import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import { serializeRegimen } from "../rx-serialize";
import { RegimensView } from "./regimens-view";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "Medications & Regimens" };

/**
 * EMR-878 — Active/Inactive regimen deep page. Reached by clicking the
 * "Active Medications" title on the Rx tab. Chronological, searchable by
 * date / name / dosing / ratio / frequency / milligrams.
 */
export default async function RegimensPage({ params }: PageProps) {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: { id: params.id, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) notFound();

  const regimens = await prisma.dosingRegimen.findMany({
    where: { patientId: params.id },
    include: { product: true },
    orderBy: { startDate: "desc" },
    take: 200,
  });

  const serialized = regimens.map(serializeRegimen);

  return (
    <PageShell maxWidth="max-w-[1080px]">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Avatar firstName={patient.firstName} lastName={patient.lastName} size="lg" />
          <div>
            <Eyebrow className="mb-2">Medications</Eyebrow>
            <h1 className="font-display text-2xl text-text tracking-tight">
              Regimens for {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Active and inactive prescriptions, searchable across every field.
            </p>
          </div>
        </div>
        <Link href={`/clinic/patients/${params.id}?tab=rx`}>
          <Button variant="secondary" size="sm">
            Back to Rx
          </Button>
        </Link>
      </div>

      <RegimensView patientId={params.id} regimens={serialized} />
    </PageShell>
  );
}
