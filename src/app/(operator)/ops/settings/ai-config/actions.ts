"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { defaultFleetEnabledForPractice } from "@/lib/orchestration/fleet";
import { mergeAiConfig } from "@/lib/practice-config/ai-config-merge";

export async function saveAiConfigAction(data: {
  defaultModel?: {
    provider: string;
    modelId: string;
    apiKey?: string;
    maxTokens: number;
    temperature: number;
  };
  fleet?: Record<string, { enabled: boolean; modelId: string | null }>;
}) {
  const user = await requireUser();
  if (!user.organizationId) {
    throw new Error("Unauthorized: organizationId is required");
  }

  // Find the latest PracticeConfiguration
  let practiceConfig = await prisma.practiceConfiguration.findFirst({
    where: { organizationId: user.organizationId },
    orderBy: { version: "desc" },
  });

  if (!practiceConfig) {
    let practice = await prisma.practice.findFirst({
      where: { organizationId: user.organizationId },
    });
    if (!practice) {
      practice = await prisma.practice.create({
        data: {
          organizationId: user.organizationId,
          name: user.organizationName || "Practice",
        },
      });
    }
    practiceConfig = await prisma.practiceConfiguration.create({
      data: {
        organizationId: user.organizationId,
        practiceId: practice.id,
        status: "published",
        selectedSpecialty: "cannabis-medicine",
        careModel: "collaborative",
        enabledModalities: ["cannabis-medicine"],
        disabledModalities: [],
        workflowTemplateIds: [],
        chartingTemplateIds: [],
        physicianShellTemplateId: "physician-default",
        patientShellTemplateId: "patient-default",
        regulatoryFlags: {
          // Ship inert (EMR-757): new practices default agents OFF; practices
          // predating the cutoff are grandfathered ON.
          aiConfig: {
            fleetDefaultEnabled: defaultFleetEnabledForPractice(practice.createdAt),
          },
        },
      },
    });
  }

  const existingFlags = (practiceConfig.regulatoryFlags ?? {}) as Record<string, any>;
  const existingAiConfig = existingFlags.aiConfig ?? {};

  // Merge the edit onto the existing config WITHOUT dropping untouched keys.
  // (Rebuilding as { defaultModel, fleet } used to erase fleetDefaultEnabled —
  // the ship-inert flag — re-enabling the whole fleet on the first save.)
  const updatedAiConfig = mergeAiConfig(existingAiConfig, {
    defaultModel: data.defaultModel,
    fleet: data.fleet,
  });

  await prisma.practiceConfiguration.update({
    where: { id: practiceConfig.id },
    data: {
      regulatoryFlags: {
        ...existingFlags,
        aiConfig: updatedAiConfig,
      },
    },
  });

  // Log in AuditLog
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "ai.config.updated",
      subjectType: "PracticeConfiguration",
      subjectId: practiceConfig.id,
      metadata: {
        defaultModelProvider: updatedAiConfig.defaultModel.provider,
        defaultModelId: updatedAiConfig.defaultModel.modelId,
        fleetUpdatedCount: Object.keys(data.fleet ?? {}).length,
      },
    },
  });

  revalidatePath("/ops/settings/ai-config");
}
