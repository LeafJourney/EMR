"use server";

// EMR-1116 (PJ-4 / PJ-M2) — real notification feed round trip.
// Mark-read state persists on the Notification model (`read` + `readAt`),
// and per-type notification preferences persist into the patient's
// CommunicationPreference.preferences JSON under `notificationTypes`.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import {
  NOTIFICATION_CONFIG,
  type NotificationChannel,
  type NotificationPreference,
  type NotificationType,
} from "@/lib/domain/notifications";

export type NotificationActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type SavePreferencesResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string };

const NOTIFICATION_TYPES = Object.keys(NOTIFICATION_CONFIG) as NotificationType[];
const CHANNELS: NotificationChannel[] = ["in_app", "email", "sms"];

const preferencesSchema = z
  .array(
    z.object({
      type: z.enum(NOTIFICATION_TYPES as [NotificationType, ...NotificationType[]]),
      enabled: z.boolean(),
      channels: z.array(z.enum(CHANNELS as [NotificationChannel, ...NotificationChannel[]])),
    }),
  )
  .max(NOTIFICATION_TYPES.length * 2);

function revalidateNotificationSurfaces() {
  // The unread badge lives in the patient layout nav; revalidate the layout
  // so the count updates alongside the list.
  revalidatePath("/portal", "layout");
  revalidatePath("/portal/notifications");
}

/** Mark a single notification as read. Scoped to the signed-in user's rows. */
export async function markNotificationReadAction(
  notificationId: string,
): Promise<NotificationActionResult> {
  const user = await requireRole("patient");
  if (!notificationId) return { ok: false, error: "Missing notification id." };

  // updateMany so the userId scope is part of the WHERE — a patient can never
  // flip another user's rows, and re-marking an already-read row is a no-op.
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id, read: false },
    data: { read: true, readAt: new Date() },
  });

  revalidateNotificationSurfaces();
  return { ok: true };
}

/** Mark every unread notification for the signed-in user as read. */
export async function markAllNotificationsReadAction(): Promise<NotificationActionResult> {
  const user = await requireRole("patient");

  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true, readAt: new Date() },
  });

  revalidateNotificationSurfaces();
  return { ok: true };
}

/**
 * Persist the per-type notification preferences into
 * CommunicationPreference.preferences.notificationTypes (merged, so the
 * sibling blocks — reminders, previsit, category toggles — are preserved).
 */
export async function saveNotificationPreferencesAction(
  input: NotificationPreference[],
): Promise<SavePreferencesResult> {
  const user = await requireRole("patient");

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid notification preferences." };
  }

  const notificationTypes: Record<
    string,
    { enabled: boolean; channels: NotificationChannel[] }
  > = {};
  for (const pref of parsed.data) {
    notificationTypes[pref.type] = {
      enabled: pref.enabled,
      channels: [...new Set(pref.channels)],
    };
  }

  const existing = await prisma.communicationPreference.findUnique({
    where: { userId: user.id },
    select: { preferences: true },
  });
  const base =
    existing?.preferences &&
    typeof existing.preferences === "object" &&
    !Array.isArray(existing.preferences)
      ? (existing.preferences as Record<string, unknown>)
      : {};
  const mergedPreferences = { ...base, notificationTypes };

  await prisma.communicationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, preferences: mergedPreferences },
    update: { preferences: mergedPreferences },
  });

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient?.organizationId ?? user.organizationId,
      actorUserId: user.id,
      action: "patient.notificationPreferences.updated",
      subjectType: "CommunicationPreference",
      subjectId: user.id,
      metadata: { types: Object.keys(notificationTypes) },
    },
  });

  revalidatePath("/portal/notifications");
  return { ok: true, savedAt: new Date().toISOString() };
}
