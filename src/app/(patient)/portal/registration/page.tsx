import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import { RegistrationPacket, type RegistrationPrefill } from "./registration-packet";

export const metadata = { title: "Registration" };

// EMR-489 — patient-facing digital registration packet.
export default async function RegistrationPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: {
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      email: true,
      phone: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
    },
  });

  const prefill: RegistrationPrefill = {
    firstName: patient?.firstName ?? "",
    lastName: patient?.lastName ?? "",
    dateOfBirth: patient?.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : "",
    email: patient?.email ?? "",
    phone: patient?.phone ?? "",
    addressLine1: patient?.addressLine1 ?? "",
    city: patient?.city ?? "",
    state: patient?.state ?? "",
    postalCode: patient?.postalCode ?? "",
  };

  return (
    <PageShell maxWidth="max-w-[720px]">
      <div className="mb-6">
        <Eyebrow className="mb-2">Welcome</Eyebrow>
        <h1 className="font-display text-2xl text-text tracking-tight">
          Complete your registration
        </h1>
        <p className="text-sm text-text-muted mt-1">
          A few quick steps so your care team is ready for your first visit.
        </p>
      </div>
      <Card tone="raised">
        <CardContent className="pt-6 pb-6">
          <RegistrationPacket prefill={prefill} />
        </CardContent>
      </Card>
    </PageShell>
  );
}
