"use server";

import {
  createVideoRoom,
  createMeetingToken,
  deleteVideoRoom,
  type DailyRoom,
  type DailyToken,
} from "@/lib/domain/telehealth-sdk";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { deliverMessage } from "@/lib/messaging/deliver";

export interface TelehealthVisitResult {
  room: DailyRoom;
  providerToken: DailyToken;
  patientToken: DailyToken;
  providerJoinUrl: string;
  patientJoinUrl: string;
}

/**
 * Start a telehealth visit by creating a Daily.co room + tokens for provider and patient.
 */
export async function startTelehealthVisit(
  patientId: string,
  encounterId: string,
): Promise<TelehealthVisitResult> {
  const user = await requireUser();
  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner")) {
    throw new Error("Clinician role required");
  }
  if (!user.organizationId) throw new Error("Telehealth encounter not found");

  const encounter = await prisma.encounter.findFirst({
    where: {
      id: encounterId,
      patientId,
      organizationId: user.organizationId,
      modality: "video",
      patient: { deletedAt: null },
    },
    select: {
      id: true,
      patientId: true,
      organizationId: true,
      briefingContext: true,
      patient: { select: { userId: true, firstName: true } },
    },
  });

  if (!encounter) throw new Error("Telehealth encounter not found");

  const room = await createVideoRoom(encounterId);

  const [providerToken, patientToken] = await Promise.all([
    createMeetingToken(room.name, "Provider", true),
    createMeetingToken(room.name, "Patient", false),
  ]);

  await prisma.callLog.create({
    data: {
      organizationId: user.organizationId,
      channel: "video",
      direction: "outbound",
      status: "in_progress",
      initiatorUserId: user.id,
      patientId,
      externalSessionId: room.name,
      notes: `Telehealth room for encounter ${encounter.id}`,
    },
  });

  const providerJoinUrl = `${room.url}?t=${providerToken.token}`;
  const patientJoinUrl = `${room.url}?t=${patientToken.token}`;

  // ── EMR-1115 (PJ-B3) — actually deliver the patient join link ──────
  // The room + token used to evaporate with this function's return value;
  // nothing patient-facing ever carried the URL. Persist it three ways:
  //
  // 1. Encounter.briefingContext.telehealth — briefingContext is the
  //    established merge-don't-overwrite Json metadata bag on Encounter
  //    (rooming handoff, patientConfirmedAt, demeanor all live there); the
  //    portal Appointments page reads it to render the "Join video visit"
  //    button. No schema change needed.
  // 2. A portal Message in the patient's care-team thread (the durable,
  //    patient-visible copy of the link).
  // 3. A Notification row so the portal notification feed surfaces it.
  const existingContext =
    encounter.briefingContext && typeof encounter.briefingContext === "object"
      ? (encounter.briefingContext as Record<string, unknown>)
      : {};
  await prisma.encounter.update({
    where: { id: encounter.id },
    data: {
      briefingContext: {
        ...existingContext,
        telehealth: {
          patientJoinUrl,
          roomName: room.name,
          createdAt: new Date().toISOString(),
        },
      } as any,
    },
  });

  const thread = await prisma.messageThread.findFirst({
    where: { patientId },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  const threadId =
    thread?.id ??
    (
      await prisma.messageThread.create({
        data: { patientId, subject: "Care team" },
        select: { id: true },
      })
    ).id;

  await deliverMessage({
    threadId,
    channel: "portal",
    senderUserId: user.id,
    organizationId: user.organizationId,
    body:
      `Hi ${encounter.patient.firstName} — your video visit room is ready. ` +
      `Join here when you're set: ${patientJoinUrl}\n\n` +
      `If the link doesn't open, the Join button on your Appointments page works too.`,
  });

  if (encounter.patient.userId) {
    await prisma.notification.create({
      data: {
        userId: encounter.patient.userId,
        type: "telehealth_join",
        priority: "urgent",
        title: "Your video visit is ready",
        body: "Your provider has opened the video room. Tap to join from your Appointments page.",
        href: "/portal/appointments",
        metadata: { encounterId: encounter.id, roomName: room.name },
      },
    });
  }

  return {
    room,
    providerToken,
    patientToken,
    providerJoinUrl,
    patientJoinUrl,
  };
}

/**
 * End a telehealth visit by deleting the Daily.co room (cleanup).
 */
export async function endTelehealthVisit(roomName: string): Promise<void> {
  const user = await requireUser();
  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner")) {
    throw new Error("Clinician role required");
  }
  if (!user.organizationId) throw new Error("Telehealth room not found");

  const call = await prisma.callLog.findFirst({
    where: {
      organizationId: user.organizationId,
      channel: "video",
      externalSessionId: roomName,
    },
    select: { id: true },
  });

  if (!call) throw new Error("Telehealth room not found");

  await deleteVideoRoom(roomName);
  await prisma.callLog.update({
    where: { id: call.id },
    data: {
      status: "completed",
      endedAt: new Date(),
    },
  });
}
