"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  checkAddRole,
  checkRemoveRole,
  ROLE_CHANGE_MESSAGES,
  type RoleChangeContext,
} from "@/lib/rbac/team-management";

// The roles assignable from /ops/team. Mirrors STAFF_ROLES in
// team-management.ts; kept as a literal here so zod can validate the wire
// input against an exact enum (platform/realm roles are rejected as invalid
// before any DB work).
const STAFF_ROLE_VALUES = [
  "front_office",
  "back_office",
  "midlevel",
  "clinician",
  "operator",
  "practice_admin",
  "practice_owner",
] as const;

const RoleMutationSchema = z.object({
  targetUserId: z.string().min(1),
  role: z.enum(STAFF_ROLE_VALUES),
});

export type RoleActionResult = { ok: true } | { ok: false; error: string };

// Callers pass the broad `Role` type; the zod schema narrows it at runtime
// and rejects any role that isn't a practice-assignable staff role.
export interface RoleMutationInput {
  targetUserId: string;
  role: Role;
}

export async function addStaffRole(
  input: RoleMutationInput,
): Promise<RoleActionResult> {
  return mutateRole("add", input);
}

export async function removeStaffRole(
  input: RoleMutationInput,
): Promise<RoleActionResult> {
  return mutateRole("remove", input);
}

async function mutateRole(
  op: "add" | "remove",
  input: unknown,
): Promise<RoleActionResult> {
  const actor = await requireUser();
  if (!actor.organizationId) return { ok: false, error: "Missing organization." };
  const orgId = actor.organizationId;

  const parsed = RoleMutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { targetUserId, role } = parsed.data;

  // Org-scope every read: the target must be a member of the actor's
  // practice. This both authorizes and prevents cross-tenant mutation.
  const memberships = await prisma.membership.findMany({
    where: { userId: targetUserId, organizationId: orgId },
    select: { role: true },
  });
  if (memberships.length === 0) {
    return { ok: false, error: "Member not found in your practice." };
  }

  const ownerCount = await prisma.membership.count({
    where: { organizationId: orgId, role: "practice_owner" },
  });

  const ctx: RoleChangeContext = {
    actorRoles: actor.roles,
    targetRole: role as Role,
    memberCurrentRoles: memberships.map((m) => m.role),
    ownerCount,
  };

  const err = op === "add" ? checkAddRole(ctx) : checkRemoveRole(ctx);
  if (err === "noop") {
    // Already in the desired state — treat as success so the UI settles.
    revalidatePath("/ops/team");
    return { ok: true };
  }
  if (err) return { ok: false, error: ROLE_CHANGE_MESSAGES[err] };

  if (op === "add") {
    // The @@unique([userId, organizationId, role]) constraint makes this
    // idempotent under a race; the noop check above handles the common case.
    await prisma.membership.create({
      data: { userId: targetUserId, organizationId: orgId, role: role as Role },
    });
  } else {
    await prisma.membership.deleteMany({
      where: { userId: targetUserId, organizationId: orgId, role: role as Role },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: actor.id,
      action: op === "add" ? "membership.role.granted" : "membership.role.revoked",
      subjectType: "User",
      subjectId: targetUserId,
      metadata: { role },
    },
  });

  revalidatePath("/ops/team");
  return { ok: true };
}
