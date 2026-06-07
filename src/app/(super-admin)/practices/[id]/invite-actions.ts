"use server";

// Team / staff invitation actions for the practice detail page.
// Create + revoke + list pending invites against the OrgInvitation model.
// Auth mirrors the other controller actions (super_admin / implementation_admin)
// and every mutation writes a ControllerAuditLog row.
//
// TODO(invite-email + accept): sending the invitation email and the
// /invite/accept/[token] → Membership flow are the next slice. Until then an
// invite is a tracked "pending" record the super-admin can see and revoke — we
// never fabricate an "accepted" state.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { logControllerAction } from "@/lib/auth/audit-stub";
import type { Role } from "@prisma/client";
import { INVITABLE_ROLES } from "../types";

export type InviteResult = { ok: true; id: string } | { ok: false; message: string };

function authorized(roles: string[]): boolean {
  return roles.includes("super_admin") || roles.includes("implementation_admin");
}

export async function inviteToPractice(input: {
  organizationId: string;
  email: string;
  role: string;
}): Promise<InviteResult> {
  const user = await requireUser();
  if (!authorized(user.roles)) return { ok: false, message: "Not authorized." };

  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (!INVITABLE_ROLES.includes(input.role as (typeof INVITABLE_ROLES)[number])) {
    return { ok: false, message: "Pick a valid role." };
  }

  // Don't stack duplicate pending invites for the same email + org.
  const existing = await prisma.orgInvitation.findFirst({
    where: { organizationId: input.organizationId, email, status: "pending" },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, message: "There's already a pending invite for that email." };
  }

  const inv = await prisma.orgInvitation.create({
    data: {
      organizationId: input.organizationId,
      email,
      role: input.role as Role,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 14 * 86_400_000), // 14-day window
    },
    select: { id: true },
  });

  await logControllerAction({
    actor: user,
    action: "controller.invitation.created",
    targetId: inv.id,
    reason: `Invited ${email} as ${input.role}`,
  });

  revalidatePath("/practices");
  return { ok: true, id: inv.id };
}

export async function revokeInvitation(invitationId: string): Promise<InviteResult> {
  const user = await requireUser();
  if (!authorized(user.roles)) return { ok: false, message: "Not authorized." };

  const inv = await prisma.orgInvitation.findUnique({
    where: { id: invitationId },
    select: { id: true, status: true },
  });
  if (!inv) return { ok: false, message: "Invitation not found." };
  if (inv.status !== "pending") {
    return { ok: false, message: "Only pending invitations can be revoked." };
  }

  await prisma.orgInvitation.update({
    where: { id: invitationId },
    data: { status: "revoked", revokedAt: new Date() },
  });

  await logControllerAction({
    actor: user,
    action: "controller.invitation.revoked",
    targetId: invitationId,
  });

  revalidatePath("/practices");
  return { ok: true, id: invitationId };
}
