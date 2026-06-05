"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { computeQueueTransition, type VisitSpineStatus } from "@/lib/domain/visit-state";

const QUEUE_STATE_ROLES = new Set([
  "front_office",
  "back_office",
  "operator",
  "practice_owner",
  "practice_admin",
  "system",
]);

const TransitionSchema = z.object({
  encounterId: z.string().min(1),
  target: z.enum([
    "checked_in",
    "info_incomplete",
    "ready",
    "rooming",
    "roomed",
    "wrap_up",
    "complete",
    "cancelled",
    "no_show",
  ]),
});

const RoomingSchema = z.object({
  encounterId: z.string().min(1),
  room: z.string().max(20).optional(),
  handoffNote: z.string().max(1000).optional(),
  readinessFlags: z.array(z.string().max(100)).max(10).default([]),
});

type QueueUser = Awaited<ReturnType<typeof requireUser>>;
type QueueAuthResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string };

export async function moveQueueEncounter(payload: z.infer<typeof TransitionSchema>) {
  const user = await requireUser();
  const auth = authorizeQueueUser(user);
  if (!auth.ok) return auth;

  const parsed = TransitionSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid queue transition." };

  const encounter = await prisma.encounter.findFirst({
    where: {
      id: parsed.data.encounterId,
      organizationId: auth.organizationId,
    },
  });
  if (!encounter) return { ok: false, error: "Encounter not found." };

  if (encounter.status === parsed.data.target) {
    revalidatePath("/ops/queue");
    return { ok: true };
  }

  const next = computeQueueTransition(
    encounter,
    parsed.data.target as VisitSpineStatus,
  );
  if (!next.ok) return next;

  await prisma.encounter.update({
    where: { id: encounter.id },
    data: next.data as any,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: encounter.organizationId,
      actorUserId: user.id,
      action: "encounter.visit_state.updated",
      subjectType: "Encounter",
      subjectId: encounter.id,
      metadata: { from: encounter.status, to: parsed.data.target },
    },
  });

  revalidatePath("/ops/queue");
  return { ok: true };
}

export async function saveRoomingHandoff(payload: z.infer<typeof RoomingSchema>) {
  const user = await requireUser();
  const auth = authorizeQueueUser(user);
  if (!auth.ok) return auth;

  const parsed = RoomingSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid rooming handoff." };

  const encounter = await prisma.encounter.findFirst({
    where: {
      id: parsed.data.encounterId,
      organizationId: auth.organizationId,
    },
    select: {
      id: true,
      organizationId: true,
      briefingContext: true,
    },
  });
  if (!encounter) return { ok: false, error: "Encounter not found." };

  const existingContext = readJsonObject(encounter.briefingContext);
  const existingRooming = readJsonObject(existingContext.rooming);
  const rooming: Record<string, unknown> = {
    ...existingRooming,
    readinessFlags: parsed.data.readinessFlags,
    updatedAt: new Date().toISOString(),
    updatedByUserId: user.id,
  };
  if (parsed.data.room !== undefined) rooming.room = parsed.data.room.trim();
  if (parsed.data.handoffNote !== undefined) {
    rooming.handoffNote = parsed.data.handoffNote.trim();
  }

  await prisma.encounter.update({
    where: { id: encounter.id },
    data: {
      briefingContext: {
        ...existingContext,
        rooming,
      } as Prisma.InputJsonValue,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: encounter.organizationId,
      actorUserId: user.id,
      action: "encounter.rooming.updated",
      subjectType: "Encounter",
      subjectId: encounter.id,
      metadata: {
        roomSet: typeof rooming.room === "string" && rooming.room.length > 0,
        readinessFlagCount: parsed.data.readinessFlags.length,
      },
    },
  });

  revalidatePath("/ops/queue");
  return { ok: true };
}

function authorizeQueueUser(user: QueueUser): QueueAuthResult {
  if (!user.organizationId) return { ok: false, error: "Missing organization." };
  if (!user.roles.some((role) => QUEUE_STATE_ROLES.has(role))) {
    return { ok: false, error: "Forbidden." };
  }
  return { ok: true, organizationId: user.organizationId };
}

function readJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
