import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import { ImagingOrderForm } from "./imaging-order-form";
import { OrderHistory } from "../order-history";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "Order imaging" };

export default async function ImagingOrdersPage({ params }: PageProps) {
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
    <PageShell maxWidth="max-w-[1080px]">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Avatar
            firstName={patient.firstName}
            lastName={patient.lastName}
            size="lg"
          />
          <div>
            <Eyebrow className="mb-2">Imaging orders</Eyebrow>
            <h1 className="font-display text-2xl text-text tracking-tight">
              Order imaging for {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Select the imaging modality, clinical indication, and diagnosis codes.
            </p>
          </div>
        </div>
        <Link href={`/clinic/patients/${params.id}`}>
          <Button variant="secondary" size="sm">
            Back to chart
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        <ImagingOrderForm
          patientId={patient.id}
          patientName={`${patient.firstName} ${patient.lastName}`}
        />

        <OrderHistory
          patientId={patient.id}
          organizationId={user.organizationId!}
          orderType="imaging"
        />
      </div>
    </PageShell>
  );
}
