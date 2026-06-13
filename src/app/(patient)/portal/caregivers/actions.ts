"use server";

// Real persistence for patient-managed caregiver access (was client-only demo
// state that silently lost every invite/revoke). Writes to the CaregiverInvite
// model, scoped to the signed-in patient.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";
import { ACCESS_LEVELS, type AccessLevel } from "@/lib/domain/caregiver-access";

const INVITE_WINDOW_DAYS = 30;

async function requirePatientId(): Promise<string> {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) throw new Error("FORBIDDEN");
  return patient.id;
}

export interface InviteCaregiverInput {
  caregiverName: string;
  caregiverEmail: string;
  relationship: string;
  accessLevel: AccessLevel;
}

export async function inviteCaregiver(
  input: InviteCaregiverInput,
): Promise<{ ok: boolean }> {
  const patientId = await requirePatientId();
  const name = input.caregiverName.trim();
  const email = input.caregiverEmail.trim().toLowerCase();
  if (!name || !email || !input.relationship) return { ok: false };

  await prisma.caregiverInvite.create({
    data: {
      patientId,
      caregiverName: name,
      caregiverEmail: email,
      relationship: input.relationship,
      accessLevel: input.accessLevel,
      status: "invited",
      expiresAt: new Date(Date.now() + INVITE_WINDOW_DAYS * 86_400_000),
    },
  });

  // Best-effort invite email — returns { ok:false, reason:"no-api-key" } (not a
  // throw) when RESEND_API_KEY is unset, so the persisted invite stands either
  // way. Never let an email failure roll back the access grant.
  try {
    const levelLabel = ACCESS_LEVELS[input.accessLevel].label;
    await sendEmail({
      to: [email],
      subject: "You've been invited as a caregiver on Leafjourney",
      text:
        `Hi ${name},\n\n` +
        `A Leafjourney patient has invited you as a caregiver with "${levelLabel}" access ` +
        `to their health record. Sign in (or create your account) at Leafjourney to accept.\n\n` +
        `This invitation expires in ${INVITE_WINDOW_DAYS} days. If you weren't expecting it, you can ignore this email.`,
    });
  } catch {
    // email is best-effort; the invite is already persisted.
  }

  revalidatePath("/portal/caregivers");
  return { ok: true };
}

export async function revokeCaregiver(id: string): Promise<{ ok: boolean }> {
  const patientId = await requirePatientId();
  // Scope to THIS patient's invite so one patient can't revoke another's.
  const result = await prisma.caregiverInvite.updateMany({
    where: { id, patientId },
    data: { status: "revoked", revokedAt: new Date() },
  });
  revalidatePath("/portal/caregivers");
  return { ok: result.count > 0 };
}
