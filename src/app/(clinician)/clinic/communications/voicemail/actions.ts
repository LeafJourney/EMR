"use server";

// EMR-146 — voicemail server actions.
//
// `recordVoicemailAction` is the path the phone-system webhook would
// hit when a missed call drops a recording. We expose it as a server
// action so a clinician can also "log a voicemail" manually (e.g. a
// patient calling the front desk who couldn't be reached). All paths
// run the redaction layer before persistence.
//
// Review actions: mark listened, archive, assign.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { ingestVoicemailTranscript } from "@/lib/communications/voicemail";

// EMR-1111 (FO-M4) — recordVoicemailAction previously had no role gate at
// all; front desk could log voicemails only "by accident". This explicit
// allowlist makes desk access policy, not luck, and shuts the door on
// patient / kiosk / platform logins calling the action directly.
const VOICEMAIL_LOG_ROLES: ReadonlySet<Role> = new Set<Role>([
  "front_office",
  "back_office",
  "clinician",
  "midlevel",
  "practice_owner",
  "operator",
]);

const recordSchema = z.object({
  fromNumber: z
    .string()
    .min(7)
    .max(20)
    .regex(/^[\d+\-().\s]+$/, "Use digits, +, -, ()"),
  patientId: z.string().optional().nullable(),
  durationSeconds: z.coerce.number().int().min(1).max(60 * 30).optional(),
  audioStorageKey: z.string().max(500).optional().nullable(),
  rawTranscript: z.string().max(20_000).optional().nullable(),
  assignedToUserId: z.string().optional().nullable(),
});

export type RecordVoicemailResult =
  | { ok: true; voicemailId: string }
  | { ok: false; error: string };

export async function recordVoicemailAction(
  _prev: RecordVoicemailResult | null,
  formData: FormData,
): Promise<RecordVoicemailResult> {
  const user = await requireUser();
  if (!user.organizationId) {
    return { ok: false, error: "No organization context." };
  }
  if (!user.roles.some((r) => VOICEMAIL_LOG_ROLES.has(r))) {
    return { ok: false, error: "You don't have permission to log voicemails." };
  }

  const parsed = recordSchema.safeParse({
    fromNumber: (formData.get("fromNumber") as string)?.trim(),
    patientId: (formData.get("patientId") as string) || null,
    durationSeconds: formData.get("durationSeconds") || undefined,
    audioStorageKey: (formData.get("audioStorageKey") as string) || null,
    rawTranscript: (formData.get("rawTranscript") as string) || null,
    assignedToUserId: (formData.get("assignedToUserId") as string) || null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid voicemail payload.",
    };
  }

  // Same-org enforcement for any optional FKs.
  if (parsed.data.patientId) {
    const patient = await prisma.patient.findFirst({
      where: {
        id: parsed.data.patientId,
        organizationId: user.organizationId,
      },
      select: { id: true },
    });
    if (!patient) return { ok: false, error: "Patient not in your org." };
  }
  if (parsed.data.assignedToUserId) {
    const assignee = await prisma.membership.findFirst({
      where: {
        userId: parsed.data.assignedToUserId,
        organizationId: user.organizationId,
      },
      select: { id: true },
    });
    if (!assignee) {
      return { ok: false, error: "Assignee isn't a member of your org." };
    }
  }

  const ingested = ingestVoicemailTranscript(parsed.data.rawTranscript);

  // Voicemail rides on a synthetic inbound CallLog so it shows up in
  // call history and metric tiles alongside outbound calls.
  const result = await prisma.$transaction(async (tx) => {
    const call = await tx.callLog.create({
      data: {
        organizationId: user.organizationId!,
        channel: "phone",
        direction: "inbound",
        status: "missed",
        externalNumber: parsed.data.fromNumber,
        patientId: parsed.data.patientId ?? null,
        durationSeconds: parsed.data.durationSeconds ?? null,
        endedAt: new Date(),
      },
      select: { id: true },
    });
    const vm = await tx.voicemail.create({
      data: {
        callLogId: call.id,
        organizationId: user.organizationId!,
        fromNumber: parsed.data.fromNumber,
        patientId: parsed.data.patientId ?? null,
        audioStorageKey: parsed.data.audioStorageKey ?? null,
        durationSeconds: parsed.data.durationSeconds ?? null,
        rawTranscriptCipher: ingested.rawTranscriptCipher,
        pertinentSummary: ingested.pertinentSummary,
        clinicalBullets: ingested.clinicalBullets,
        redactedCategories: ingested.redactedCategories,
        assignedToUserId: parsed.data.assignedToUserId ?? null,
      },
      select: { id: true },
    });
    return { voicemailId: vm.id };
  });

  revalidatePath("/clinic/communications");
  revalidatePath("/clinic/communications/voicemail");
  return { ok: true, voicemailId: result.voicemailId };
}

const idSchema = z.object({ voicemailId: z.string().min(1) });

export async function markVoicemailListenedAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };

  const parsed = idSchema.safeParse({ voicemailId: formData.get("voicemailId") });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const vm = await prisma.voicemail.findFirst({
    where: {
      id: parsed.data.voicemailId,
      organizationId: user.organizationId,
    },
    select: { id: true },
  });
  if (!vm) return { ok: false, error: "Voicemail not found." };

  await prisma.voicemail.update({
    where: { id: vm.id },
    data: {
      status: "listened",
      listenedByUserId: user.id,
      listenedAt: new Date(),
    },
  });

  revalidatePath("/clinic/communications/voicemail");
  return { ok: true };
}

export async function archiveVoicemailAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };

  const parsed = idSchema.safeParse({ voicemailId: formData.get("voicemailId") });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const vm = await prisma.voicemail.findFirst({
    where: {
      id: parsed.data.voicemailId,
      organizationId: user.organizationId,
    },
    select: { id: true, status: true, listenedAt: true },
  });
  if (!vm) return { ok: false, error: "Voicemail not found." };

  // Archive implies "listened" — don't leave a stale 'new' badge.
  await prisma.voicemail.update({
    where: { id: vm.id },
    data: {
      status: "archived",
      listenedByUserId: vm.listenedAt ? undefined : user.id,
      listenedAt: vm.listenedAt ?? new Date(),
    },
  });

  revalidatePath("/clinic/communications/voicemail");
  return { ok: true };
}

const assignSchema = z.object({
  voicemailId: z.string().min(1),
  assigneeUserId: z.string().min(1),
});

export async function assignVoicemailAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };

  const parsed = assignSchema.safeParse({
    voicemailId: formData.get("voicemailId"),
    assigneeUserId: formData.get("assigneeUserId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const [vm, member] = await Promise.all([
    prisma.voicemail.findFirst({
      where: {
        id: parsed.data.voicemailId,
        organizationId: user.organizationId,
      },
      select: { id: true },
    }),
    prisma.membership.findFirst({
      where: {
        userId: parsed.data.assigneeUserId,
        organizationId: user.organizationId,
      },
      select: { id: true },
    }),
  ]);
  if (!vm) return { ok: false, error: "Voicemail not found." };
  if (!member) return { ok: false, error: "Assignee isn't in your org." };

  await prisma.voicemail.update({
    where: { id: vm.id },
    data: { assignedToUserId: parsed.data.assigneeUserId },
  });

  revalidatePath("/clinic/communications/voicemail");
  return { ok: true };
}
