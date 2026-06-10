"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { defaultFleetEnabledForPractice } from "@/lib/orchestration/fleet";
import { mergeAiConfig } from "@/lib/practice-config/ai-config-merge";
import {
  setOrgAiCredential,
  getOrgAiCredentialView,
  resolveByokApiKey,
  MASKED_API_KEY,
} from "@/lib/ai/credential-store";
import { pingProvider, type ConnectionTestResult } from "@/lib/ai/connection-test";
import { PROVIDERS } from "@/lib/domain/byok";

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

  // The API key is a secret — it must never land in the regulatoryFlags blob.
  // Strip it before the merge; the real key is routed to the encrypted
  // OrgAiCredential store below.
  const modelForBlob = data.defaultModel
    ? { ...data.defaultModel, apiKey: undefined }
    : undefined;

  // Merge the edit onto the existing config WITHOUT dropping untouched keys.
  // (Rebuilding as { defaultModel, fleet } used to erase fleetDefaultEnabled —
  // the ship-inert flag — re-enabling the whole fleet on the first save.)
  const updatedAiConfig = mergeAiConfig(existingAiConfig, {
    defaultModel: modelForBlob,
    fleet: data.fleet,
  });

  // Persist the credential (provider/model/mode + encrypted key) out-of-band.
  // setOrgAiCredential leaves the stored key untouched when the UI sends the
  // masked sentinel or no key, and only encrypts when a real key is supplied.
  if (data.defaultModel) {
    try {
      await setOrgAiCredential({
        organizationId: user.organizationId,
        provider: data.defaultModel.provider,
        modelId: data.defaultModel.modelId,
        apiKeyPlaintext: data.defaultModel.apiKey,
        setById: user.id,
      });
    } catch {
      throw new Error(
        "Could not securely store the API key. Encryption is not configured (EMR_PHI_KEK).",
      );
    }
  }

  // Reflect "key on file" in the blob for the UI's masked state — never the key.
  const credView = await getOrgAiCredentialView(user.organizationId);
  if (updatedAiConfig.defaultModel) {
    updatedAiConfig.defaultModel.apiKey = "";
    updatedAiConfig.defaultModel.apiKeySet = !!credView?.apiKeySet;
  }

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

/** Per-provider env fallback for the managed/platform key. */
function platformKeyForProvider(provider: string): string | undefined {
  switch (provider.toLowerCase()) {
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    default:
      return undefined;
  }
}

/**
 * Real connection test. Validates the key against the provider's auth endpoint
 * (no token spend). Tests the key the operator just typed when one is supplied;
 * otherwise resolves the stored BYOK key, then the platform key. The key is
 * resolved and used entirely server-side — it never returns to the client.
 */
export async function testAiConnectionAction(input: {
  provider: string;
  apiKey?: string;
}): Promise<ConnectionTestResult> {
  const user = await requireUser();
  if (!user.organizationId) {
    return { ok: false, message: "Unauthorized." };
  }

  const providerMeta = PROVIDERS.find(
    (p) => p.provider === input.provider.toLowerCase(),
  );
  const requiresApiKey = providerMeta?.requiresApiKey ?? true;

  // A freshly typed key (not the masked sentinel) is tested as-is; otherwise
  // fall back to the stored encrypted key, then the platform key.
  const typed =
    input.apiKey && input.apiKey !== MASKED_API_KEY && input.apiKey.trim() !== ""
      ? input.apiKey
      : null;
  const apiKey =
    typed ??
    (await resolveByokApiKey(user.organizationId)) ??
    platformKeyForProvider(input.provider) ??
    null;

  return pingProvider({ provider: input.provider, apiKey, requiresApiKey });
}
