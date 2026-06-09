import { prisma } from "../db/prisma";
import type { CDSTrigger } from "./engine";

export async function routeCDSTriggers(triggers: CDSTrigger[]) {
  for (const trigger of triggers) {
    const title = `[CDS Alert] ${trigger.ruleName}`;

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingTask = await prisma.task.findFirst({
      where: {
        patientId: trigger.patientId,
        title,
        createdAt: {
          gte: twentyFourHoursAgo,
        },
        status: "open",
      },
    });

    if (existingTask) {
      console.log(
        `[CDS] Skipping duplicate alert for ${trigger.patientId} / ${trigger.ruleName}`,
      );
      continue;
    }

    const patient = await prisma.patient.findUnique({
      where: { id: trigger.patientId },
      select: { organizationId: true },
    });

    if (!patient) continue;

    await prisma.task.create({
      data: {
        organizationId: patient.organizationId,
        patientId: trigger.patientId,
        title,
        description: `${trigger.description}\n\nReview chart at: /patients/${trigger.patientId}/biometrics`,
        status: "open",
        kind: "clinical_review",
      },
    });

    console.log(
      `[CDS] Created Task alert for ${trigger.patientId} / ${trigger.ruleName}`,
    );
  }
}
