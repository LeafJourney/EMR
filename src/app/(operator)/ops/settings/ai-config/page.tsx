import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { AiConfigTabs } from "./tabs";
import { prisma } from "@/lib/db/prisma";
import { defaultFleetEnabledForPractice } from "@/lib/orchestration/fleet";

export const metadata = { title: "AI Model Configuration" };

async function loadOrCreatePracticeConfig(
  organizationId: string,
  organizationName: string | null,
) {
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
          name: organizationName || "Practice",
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

  return practiceConfig;
}

export default async function AiConfigPage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  // A database problem here (schema drift, bad row data) used to take down
  // the whole /ops segment with an opaque error page. Degrade instead: log
  // the real cause for the server logs and render with defaults so the
  // operator can still see the surface. Saves go through the server action,
  // which re-reads + merges the stored config itself, so rendering with an
  // empty initial config cannot clobber saved settings.
  let configLoadError = false;
  let aiConfig: Record<string, any> = {};
  try {
    const practiceConfig = await loadOrCreatePracticeConfig(
      organizationId,
      user.organizationName,
    );
    const flags = (practiceConfig.regulatoryFlags ?? {}) as Record<string, any>;
    aiConfig = flags.aiConfig ?? {};
  } catch (err) {
    configLoadError = true;
    console.error(
      `[ai-config] failed to load practice configuration for org ${organizationId}:`,
      err,
    );
  }

  return (
    <PageShell maxWidth="max-w-[1080px]">
      <PageHeader
        eyebrow="Settings"
        title="AI model configuration"
        description="Pick a practice-wide default, then tune any agent in the fleet."
      />

      {configLoadError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <p className="text-sm font-medium text-amber-800">
            We couldn&apos;t load your saved AI configuration.
          </p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            The settings below show platform defaults, not your saved values.
            The underlying database error has been written to the server logs
            (search for &quot;[ai-config]&quot;). Saving may fail until it is
            resolved.
          </p>
        </div>
      )}

      <AiConfigTabs initialAiConfig={aiConfig} />
    </PageShell>
  );
}

