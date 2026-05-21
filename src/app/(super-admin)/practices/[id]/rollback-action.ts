// EMR-748 — Server action that rolls a PracticeConfiguration back to a
// historical version. Writes a new draft snapshot off of the chosen
// version's payload and emits a `controller.config.rollback`
// ControllerAuditLog row.
//
// The history tab's RollbackButton calls this with a double-confirm
// (the operator must type the practice name verbatim — see the client
// component). The handler re-verifies authz + double-checks the
// practice name match so an attacker can't bypass the dialog by
// posting directly.

"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { logControllerAction } from "@/lib/auth/audit-stub";

export interface RollbackActionInput {
  configurationId: string;
  targetVersion: number;
  /** Required: free-text reason persisted on the audit row. */
  reason: string;
  /** Double-confirm: must equal the practice name (case-insensitive). */
  confirmName: string;
}

export type RollbackActionResult =
  | { ok: true; newDraftId: string; newVersion: number }
  | {
      ok: false;
      code:
        | "unauthorized"
        | "not_found"
        | "name_mismatch"
        | "missing_reason"
        | "same_version";
      message: string;
    };

export async function rollbackPracticeConfig(
  input: RollbackActionInput,
): Promise<RollbackActionResult> {
  const user = await requireUser();
  if (!user.roles.includes("super_admin") && !user.roles.includes("implementation_admin")) {
    return { ok: false, code: "unauthorized", message: "not authorized" };
  }
  if (!input.reason || input.reason.trim().length < 4) {
    return {
      ok: false,
      code: "missing_reason",
      message: "a reason is required (min 4 chars)",
    };
  }

  const config = await prisma.practiceConfiguration.findUnique({
    where: { id: input.configurationId },
    select: {
      id: true,
      organizationId: true,
      practiceId: true,
      version: true,
    },
  });
  if (!config) {
    return { ok: false, code: "not_found", message: "configuration not found" };
  }

  if (config.version === input.targetVersion) {
    return {
      ok: false,
      code: "same_version",
      message: "target version equals current version",
    };
  }

  // Resolve the practice display name and verify the operator typed it.
  const practiceName = await resolvePracticeName({
    practiceId: config.practiceId,
    organizationId: config.organizationId,
  });
  if (
    !practiceName ||
    practiceName.trim().toLowerCase() !==
      input.confirmName.trim().toLowerCase()
  ) {
    return {
      ok: false,
      code: "name_mismatch",
      message: "practice name confirmation did not match",
    };
  }

  const targetVersion = await prisma.practiceConfigurationVersion.findFirst({
    where: {
      configurationId: input.configurationId,
      version: input.targetVersion,
    },
    select: { snapshot: true, version: true },
  });
  if (!targetVersion) {
    return { ok: false, code: "not_found", message: "target version missing" };
  }

  const snapshot = (targetVersion.snapshot ?? {}) as Record<string, unknown>;

  const newVersionNumber = config.version + 1;

  // Snapshot before/after for the audit row.
  const before = {
    configurationId: config.id,
    fromVersion: config.version,
  };
  const after = {
    configurationId: config.id,
    rolledBackToVersion: targetVersion.version,
    newVersion: newVersionNumber,
  };

  await prisma.$transaction([
    prisma.practiceConfiguration.update({
      where: { id: input.configurationId },
      data: {
        status: "draft",
        version: newVersionNumber,
        // Snapshot fields we know are scalars on the model. Anything
        // structured stays in the JSON snapshot for now — the
        // configuration-from-snapshot rehydrator is owned by EMR-409.
        selectedSpecialty:
          (snapshot.selectedSpecialty as string | undefined) ?? undefined,
        selectedSpecialtyVersion:
          (snapshot.selectedSpecialtyVersion as string | undefined) ?? undefined,
        careModel: (snapshot.careModel as string | undefined) ?? undefined,
      },
    }),
    prisma.practiceConfigurationVersion.create({
      data: {
        configurationId: config.id,
        version: newVersionNumber,
        snapshot: snapshot as Prisma.InputJsonValue,
        publishedBy: user.id,
      },
    }),
  ]);

  await logControllerAction({
    actor: user,
    action: "controller.config.rollback",
    targetId: config.id,
    before,
    after,
    reason: input.reason,
  });

  // After write, redirect back to the history tab so the operator sees the
  // new entry immediately.
  redirect(`/practices/${config.id}?tab=history`);
}

async function resolvePracticeName(args: {
  practiceId: string | null;
  organizationId: string;
}): Promise<string | null> {
  if (args.practiceId) {
    const p = await prisma.practice.findUnique({
      where: { id: args.practiceId },
      select: { name: true },
    });
    if (p?.name) return p.name;
  }
  const org = await prisma.organization.findUnique({
    where: { id: args.organizationId },
    select: { name: true, brandName: true },
  });
  return org?.brandName ?? org?.name ?? null;
}
