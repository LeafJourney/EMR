"use server";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/domain/audit-logger";

export async function logPatientEngagement(componentName: string, actionName: string, metadata?: Record<string, any>) {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });

  if (!patient) {
    throw new Error("Patient not found");
  }

  await createAuditLog({
    organizationId: patient.organizationId,
    actorId: user.id,
    targetId: patient.id,
    action: "patient.engagement_tracked",
    metadata: {
      component: componentName,
      action: actionName,
      ...metadata,
    },
  });
}
