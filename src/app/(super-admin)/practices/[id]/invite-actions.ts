"use server";

// Team / staff invitation actions for the practice detail page.
// Create + revoke + list pending invites against the OrgInvitation model.
// Auth mirrors the other controller actions (super_admin / implementation_admin)
// and every mutation writes a ControllerAuditLog row.
//
// The accept flow is implemented (acceptInvitation → Membership). The one
// remaining TODO is a real invitation EMAIL — until then the accept link is
// logged on create and surfaced as "Copy link" in the invite panel.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser, getCurrentUser } from "@/lib/auth/session";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { homeForRoles } from "@/lib/rbac/roles";
import type { Role } from "@prisma/client";
import { INVITABLE_ROLES } from "../types";
import { sendEmail } from "@/lib/email/resend";

export type InviteResult =
  | { ok: true; id: string; emailed?: boolean }
  | { ok: false; message: string };

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
    select: { id: true, token: true },
  });

  await logControllerAction({
    actor: user,
    action: "controller.invitation.created",
    targetId: inv.id,
    reason: `Invited ${email} as ${input.role}`,
  });

  // Best-effort invitation email. The invite is already created — email never
  // blocks it. sendEmail returns no-api-key when RESEND_API_KEY is unset, in
  // which case we fall back to the logged link + the panel's "Copy link".
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const acceptUrl = `${base}/invite/accept/${inv.token}`;
  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { name: true },
  });
  const orgName = org?.name ?? "a practice";
  const escOrg = orgName.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!,
  );
  const roleLabel = input.role.replace(/_/g, " ");

  const sent = await sendEmail({
    to: [email],
    subject: `You're invited to join ${orgName} on Leafjourney`,
    text:
      `You've been invited to join ${orgName} as ${roleLabel} on Leafjourney.\n\n` +
      `Accept your invitation:\n${acceptUrl}\n\n` +
      `This link expires in 14 days. If you weren't expecting this, you can ignore it.`,
    html:
      `<p>You've been invited to join <strong>${escOrg}</strong> as ${roleLabel} on Leafjourney.</p>` +
      `<p><a href="${acceptUrl}">Accept your invitation</a></p>` +
      `<p style="color:#888;font-size:12px">This link expires in 14 days. If you weren't expecting this, you can ignore it.</p>`,
    tags: [{ name: "type", value: "practice-invite" }],
  });
  const emailed = sent.ok;
  if (!emailed) {
    // No key configured or send failed — the invite still exists; the accept
    // link is logged and available via "Copy link" in the panel.
    console.info(`[invite] email not sent (${sent.reason}); link: ${acceptUrl}`);
  }

  revalidatePath("/practices");
  return { ok: true, id: inv.id, emailed };
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

export type AcceptResult =
  | { ok: true; redirectTo: string }
  | {
      ok: false;
      code:
        | "unauthenticated"
        | "not_found"
        | "not_pending"
        | "expired"
        | "email_mismatch";
      message: string;
    };

/**
 * Accept an invitation: the recipient (logged in as the invited email) is added
 * to the org with the invited role and the invite is marked accepted. Idempotent
 * on the Membership unique [userId, organizationId, role]. NOT super-admin gated
 * — any authenticated user whose email matches the invite may accept their own.
 */
export async function acceptInvitation(token: string): Promise<AcceptResult> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      code: "unauthenticated",
      message: "Sign in with the invited email to accept.",
    };
  }

  const inv = await prisma.orgInvitation.findUnique({ where: { token } });
  if (!inv) {
    return { ok: false, code: "not_found", message: "This invitation link isn't valid." };
  }
  if (inv.status !== "pending") {
    return {
      ok: false,
      code: "not_pending",
      message: "This invitation is no longer active.",
    };
  }
  if (inv.expiresAt && inv.expiresAt.getTime() < Date.now()) {
    await prisma.orgInvitation.update({
      where: { id: inv.id },
      data: { status: "expired" },
    });
    return { ok: false, code: "expired", message: "This invitation has expired." };
  }
  if (user.email.trim().toLowerCase() !== inv.email.trim().toLowerCase()) {
    return {
      ok: false,
      code: "email_mismatch",
      message: `This invitation was sent to ${inv.email}. Sign in with that email to accept.`,
    };
  }

  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: user.id,
        organizationId: inv.organizationId,
        role: inv.role,
      },
    },
    create: {
      userId: user.id,
      organizationId: inv.organizationId,
      role: inv.role,
    },
    update: {},
  });
  await prisma.orgInvitation.update({
    where: { id: inv.id },
    data: {
      status: "accepted",
      acceptedAt: new Date(),
      acceptedByUserId: user.id,
    },
  });
  await logControllerAction({
    actor: user,
    action: "controller.invitation.accepted",
    targetId: inv.id,
  });

  revalidatePath("/practices");
  return { ok: true, redirectTo: homeForRoles([...user.roles, inv.role]) };
}
