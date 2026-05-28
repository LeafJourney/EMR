"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

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
          aiConfig: {},
        },
      },
    });
  }

  const existingFlags = (practiceConfig.regulatoryFlags ?? {}) as Record<string, any>;
  const existingAiConfig = existingFlags.aiConfig ?? {};

  // Merge defaultModel settings
  let defaultModel = existingAiConfig.defaultModel ?? {};
  if (data.defaultModel) {
    // If the API key is the masked placeholder, do not overwrite it
    const apiKey = data.defaultModel.apiKey === "••••••••"
      ? defaultModel.apiKey
      : data.defaultModel.apiKey;

    defaultModel = {
      provider: data.defaultModel.provider,
      modelId: data.defaultModel.modelId,
      apiKey: apiKey ?? "",
      maxTokens: data.defaultModel.maxTokens,
      temperature: data.defaultModel.temperature,
    };
  }

  // Merge fleet overrides
  const fleet = {
    ...(existingAiConfig.fleet ?? {}),
    ...(data.fleet ?? {}),
  };

  const updatedAiConfig = {
    defaultModel,
    fleet,
  };

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
        defaultModelProvider: defaultModel.provider,
        defaultModelId: defaultModel.modelId,
        fleetUpdatedCount: Object.keys(data.fleet ?? {}).length,
      },
    },
  });

  revalidatePath("/ops/settings/ai-config");
}
