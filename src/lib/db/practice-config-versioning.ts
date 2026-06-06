import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  asRecord,
  isRollbackSnapshotBlocked,
  normalizeControllerStep,
  optionalString,
  stringArray,
} from "./practice-config-versioning-logic";

export * from "./practice-config-versioning-logic";

export type CreateRollbackDraftInput = {
  configurationId: string;
  versionId: string;
  overrideDeprecatedTemplates?: boolean;
};

export class RollbackBlockedError extends Error {
  constructor() {
    super("ROLLBACK_REQUIRES_DEPRECATED_TEMPLATE_OVERRIDE");
    this.name = "RollbackBlockedError";
  }
}

export async function createRollbackDraft(input: CreateRollbackDraftInput) {
  const version = await prisma.practiceConfigurationVersion.findFirst({
    where: {
      id: input.versionId,
      configurationId: input.configurationId,
    },
  });
  if (!version) return null;

  if (
    isRollbackSnapshotBlocked(version.snapshot) &&
    !input.overrideDeprecatedTemplates
  ) {
    throw new RollbackBlockedError();
  }

  const original = await prisma.practiceConfiguration.findUnique({
    where: { id: input.configurationId },
    select: { organizationId: true, practiceId: true },
  });
  if (!original) return null;

  const snapshot = asRecord(version.snapshot);
  return prisma.practiceConfiguration.create({
    data: {
      organizationId: String(snapshot.organizationId ?? original.organizationId),
      practiceId: String(snapshot.practiceId ?? original.practiceId),
      selectedSpecialty: optionalString(snapshot.selectedSpecialty),
      selectedSpecialtyVersion: optionalString(snapshot.selectedSpecialtyVersion),
      careModel: optionalString(snapshot.careModel),
      enabledModalities: stringArray(snapshot.enabledModalities),
      disabledModalities: stringArray(snapshot.disabledModalities),
      workflowTemplateIds: stringArray(snapshot.workflowTemplateIds),
      chartingTemplateIds: stringArray(snapshot.chartingTemplateIds),
      rolePermissionTemplateIds: stringArray(snapshot.rolePermissionTemplateIds),
      physicianShellTemplateId: optionalString(snapshot.physicianShellTemplateId),
      patientShellTemplateId: optionalString(snapshot.patientShellTemplateId),
      migrationProfileId: optionalString(snapshot.migrationProfileId),
      regulatoryProfileId: optionalString(snapshot.regulatoryProfileId),
      regulatoryFlags: asRecord(snapshot.regulatoryFlags) as Prisma.InputJsonValue,
      status: "draft",
      currentStep: normalizeControllerStep(snapshot.currentStep),
    },
  });
}
