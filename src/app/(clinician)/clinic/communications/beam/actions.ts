"use server";

// EMR-143 — schedule a HIPAA-compliant Zoom meeting from the EMR.
//
// Persists the meeting as a CallLog row (channel='video', status='initiated',
// zoom* columns populated). The passcode is encrypted at rest with the
// same envelope used for provider-to-provider message bodies — only the
// host should ever see the plaintext.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { scheduleHipaaZoomMeeting } from "@/lib/communications/zoom";
import { encryptMessageBody } from "@/lib/communications/message-crypto";

const scheduleSchema = z
  .object({
    topic: z.string().min(1).max(200),
    scheduledFor: z.string().min(1),
    durationMinutes: z.coerce.number().int().min(15).max(8 * 60),
    patientId: z.string().optional().nullable(),
    providerUserId: z.string().optional().nullable(),
  })
  .refine(
    (d) => Boolean(d.patientId) !== Boolean(d.providerUserId),
    "Pick exactly one counterparty (patient OR provider).",
  );

export type ScheduleZoomResult =
  | { ok: true; callId: string; meetingId: string; mode: "live" | "dev-shim" }
  | { ok: false; error: string };

export async function scheduleZoomMeetingAction(
  _prev: ScheduleZoomResult | null,
  formData: FormData,
): Promise<ScheduleZoomResult> {
  const user = await requireUser();
  if (!user.organizationId) {
    return { ok: false, error: "No organization context." };
  }
  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner")) {
    return { ok: false, error: "Only providers can schedule Zoom visits." };
  }

  const parsed = scheduleSchema.safeParse({
    topic: (formData.get("topic") as string)?.trim(),
    scheduledFor: formData.get("scheduledFor"),
    durationMinutes: formData.get("durationMinutes"),
    patientId: (formData.get("patientId") as string) || null,
    providerUserId: (formData.get("providerUserId") as string) || null,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid schedule payload.",
    };
  }

  const scheduledFor = new Date(parsed.data.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) {
    return { ok: false, error: "Invalid date/time." };
  }

  // Same-org enforcement.
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
  if (parsed.data.providerUserId) {
    const provider = await prisma.provider.findFirst({
      where: {
        organizationId: user.organizationId,
        userId: parsed.data.providerUserId,
      },
      select: { id: true },
    });
    if (!provider) return { ok: false, error: "Provider not in your org." };
  }

  const meeting = await scheduleHipaaZoomMeeting({
    topic: parsed.data.topic,
    scheduledFor,
    durationMinutes: parsed.data.durationMinutes,
    hostEmail: user.email,
  });

  // Encrypt the passcode at rest. The cipher envelope is what we store;
  // the plaintext only lives in memory long enough to render the
  // confirmation card to the host.
  const passcodeCipher = encryptMessageBody(meeting.passcode);

  const call = await prisma.callLog.create({
    data: {
      organizationId: user.organizationId,
      channel: "video",
      direction: "outbound",
      status: "initiated",
      initiatorUserId: user.id,
      patientId: parsed.data.patientId ?? null,
      providerUserId: parsed.data.providerUserId ?? null,
      zoomMeetingId: meeting.meetingId,
      zoomTopic: meeting.topic,
      zoomJoinUrl: meeting.joinUrl,
      zoomHostJoinUrl: meeting.hostJoinUrl,
      zoomPasscodeCipher: passcodeCipher,
      zoomScheduledAt: meeting.startTime,
      zoomDurationMinutes: meeting.durationMinutes,
    },
    select: { id: true },
  });

  revalidatePath("/clinic/communications");
  revalidatePath("/clinic/communications/zoom");
  return {
    ok: true,
    callId: call.id,
    meetingId: meeting.meetingId,
    mode: meeting.mode,
  };
}

const cancelSchema = z.object({ callId: z.string().min(1) });

export async function cancelZoomMeetingAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };

  const parsed = cancelSchema.safeParse({
    callId: formData.get("callId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const call = await prisma.callLog.findFirst({
    where: {
      id: parsed.data.callId,
      organizationId: user.organizationId,
      status: "initiated",
      zoomMeetingId: { not: null },
    },
    select: { id: true },
  });
  if (!call) return { ok: false, error: "Meeting not found or already completed." };

  await prisma.callLog.update({
    where: { id: call.id },
    data: { status: "cancelled" },
  });

  revalidatePath("/clinic/communications/zoom");
  return { ok: true };
}
