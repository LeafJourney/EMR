"use server";

// Hard-delete a DRAFT practice configuration — ONLY for true false-starts with
// zero real activity. Anything with data is archive-only (handled by the
// archive endpoint). Because the practices list is config-driven, deleting the
// draft config removes its card. We delete the draft config + its versions +
// the org's pending invites, but deliberately LEAVE the Organization / Practice
// shells intact — no cascading deletes of business entities on the shared DB.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { logControllerAction } from "@/lib/auth/audit-stub";

export type DiscardResult =
  | { ok: true }
  | {
      ok: false;
      code: "unauthorized" | "not_found" | "not_draft" | "not_empty";
      message: string;
    };

export async function discardDraftPractice(
  configId: string,
): Promise<DiscardResult> {
  const user = await requireUser();
  if (
    !user.roles.includes("super_admin") &&
    !user.roles.includes("implementation_admin")
  ) {
    return { ok: false, code: "unauthorized", message: "Not authorized." };
  }

  const config = await prisma.practiceConfiguration.findUnique({
    where: { id: configId },
    select: { id: true, organizationId: true, status: true },
  });
  if (!config) return { ok: false, code: "not_found", message: "Draft not found." };
  if (config.status !== "draft") {
    return {
      ok: false,
      code: "not_draft",
      message: "Only drafts can be discarded — archive published practices instead.",
    };
  }

  const orgId = config.organizationId;
  // Data-safety gate: ANY real activity → refuse (the UI should archive instead).
  const [patients, encounters, claims, charges, otherPublished] =
    await Promise.all([
      prisma.patient.count({ where: { organizationId: orgId, deletedAt: null } }),
      prisma.encounter.count({ where: { organizationId: orgId } }),
      prisma.claim.count({ where: { organizationId: orgId } }),
      prisma.charge.count({ where: { organizationId: orgId } }),
      prisma.practiceConfiguration.count({
        where: { organizationId: orgId, status: "published" },
      }),
    ]);
  if (patients > 0 || encounters > 0 || claims > 0 || charges > 0 || otherPublished > 0) {
    return {
      ok: false,
      code: "not_empty",
      message: "This practice has real activity — archive it instead of discarding.",
    };
  }

  // Safe to discard. Remove dependent rows, then the draft config, atomically.
  await prisma.$transaction([
    prisma.practiceConfigurationVersion.deleteMany({
      where: { configurationId: configId },
    }),
    prisma.orgInvitation.deleteMany({ where: { organizationId: orgId } }),
    prisma.practiceConfiguration.delete({ where: { id: configId } }),
  ]);

  await logControllerAction({
    actor: user,
    action: "controller.config.discarded",
    targetId: configId,
  });

  revalidatePath("/practices");
  return { ok: true };
}
