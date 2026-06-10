import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { AiConfigTabs } from "./tabs";
import { prisma } from "@/lib/db/prisma";
import { defaultFleetEnabledForPractice } from "@/lib/orchestration/fleet";
import { getOrgAiCredentialView } from "@/lib/ai/credential-store";

export const metadata = { title: "AI Model Configuration" };

export default async function AiConfigPage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  let practiceConfig = await prisma.practiceConfiguration.findFirst({
    where: { organizationId },
    orderBy: { version: "desc" },
  });

  if (!practiceConfig) {
    let practice = await prisma.practice.findFirst({
      where: { organizationId },
    });
    if (!practice) {
      practice = await prisma.practice.create({
        data: {
          organizationId,
          name: user.organizationName || "Practice",
        },
      });
    }
    practiceConfig = await prisma.practiceConfiguration.create({
      data: {
        organizationId,
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

  const flags = (practiceConfig.regulatoryFlags ?? {}) as Record<string, any>;
  let aiConfig = flags.aiConfig ?? {};

  // Overlay the credential store (the source of truth for provider/model + the
  // "key on file" flag) so the UI shows the masked state without the secret —
  // the encrypted key itself is never loaded here.
  const credView = await getOrgAiCredentialView(organizationId);
  if (credView) {
    aiConfig = {
      ...aiConfig,
      defaultModel: {
        ...(aiConfig.defaultModel ?? {}),
        provider: aiConfig.defaultModel?.provider ?? credView.provider,
        modelId: aiConfig.defaultModel?.modelId ?? credView.modelId,
        apiKey: "",
        apiKeySet: credView.apiKeySet,
      },
    };
  }

  // The per-account markup (set at account setup) drives the predictive fee the
  // practice sees. Null falls back to the platform default (2×) in code.
  const subscription = await prisma.practiceSubscription.findUnique({
    where: { organizationId },
    select: { aiMarkupMultiplier: true },
  });

  return (
    <PageShell maxWidth="max-w-[1080px]">
      <PageHeader
        eyebrow="Settings"
        title="AI model configuration"
        description="Pick a practice-wide default, then tune any agent in the fleet."
      />

      <AiConfigTabs
        initialAiConfig={aiConfig}
        markupMultiplier={subscription?.aiMarkupMultiplier ?? null}
      />
    </PageShell>
  );
}

