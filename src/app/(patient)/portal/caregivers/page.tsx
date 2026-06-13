import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  type AccessLevel,
  type CaregiverStatus,
  type CaregiverInvite,
} from "@/lib/domain/caregiver-access";
import { CaregiverManager } from "./caregiver-manager";

export const metadata = { title: "Caregiver Access" };

export default async function CaregiversPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  const rows = patient
    ? await prisma.caregiverInvite.findMany({
        where: { patientId: patient.id },
        orderBy: { invitedAt: "desc" },
      })
    : [];

  const caregivers: CaregiverInvite[] = rows.map((r) => ({
    id: r.id,
    patientId: r.patientId,
    caregiverEmail: r.caregiverEmail,
    caregiverName: r.caregiverName,
    relationship: r.relationship,
    accessLevel: r.accessLevel as AccessLevel,
    status: r.status as CaregiverStatus,
    invitedAt: r.invitedAt.toISOString(),
    acceptedAt: r.acceptedAt?.toISOString(),
    revokedAt: r.revokedAt?.toISOString(),
    expiresAt: r.expiresAt?.toISOString(),
  }));

  return (
    <PageShell maxWidth="max-w-[880px]">
      <PageHeader
        eyebrow="Caregivers"
        title="Caregiver access"
        description="Invite family members or caregivers to view or manage parts of your health record. You control who has access and can revoke it at any time."
      />

      <PatientSectionNav section="account" />

      <CaregiverManager initialCaregivers={caregivers} />
    </PageShell>
  );
}
