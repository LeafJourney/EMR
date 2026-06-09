"use server";

/**
 * EMR-211 — Reminder preference persistence (REAL, DB-backed).
 *
 * Promotes the reminder settings off the interim localStorage store onto the
 * existing per-user `CommunicationPreference` row — no schema change. The full
 * ChannelPrefs blob lives in `preferences.reminders` (JSON) for fidelity, while
 * `smsOptIn`, `emailFrequency`, and `quietHours{Start,End}` are mirrored to the
 * dedicated columns so other comms features reading those stay consistent.
 */

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { Prisma } from "@prisma/client";
import { ChannelPrefsSchema, type ChannelPrefs } from "@/lib/scheduling/reminders";

const DEFAULTS: ChannelPrefs = {
  smsOptIn: true,
  emailOptIn: true,
  pushOptIn: true,
  quietHours: { startHour: 21, endHour: 8 },
  timezone: "America/Los_Angeles",
  preferredChannel: "sms",
};

function hourOf(hhmm: string): number {
  const n = Number(hhmm.split(":")[0]);
  return Number.isFinite(n) ? Math.max(0, Math.min(23, n)) : 0;
}

function pad(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Read the signed-in-or-given user's reminder prefs. Prefers the full JSON
 * blob; falls back to reconstructing from the dedicated columns; else defaults.
 * Safe to call from a server component.
 */
export async function loadReminderPrefs(userId: string): Promise<ChannelPrefs> {
  const row = await prisma.communicationPreference.findUnique({ where: { userId } });
  if (!row) return DEFAULTS;

  const prefsObj =
    row.preferences && typeof row.preferences === "object" && !Array.isArray(row.preferences)
      ? (row.preferences as Record<string, unknown>)
      : {};
  const parsed = ChannelPrefsSchema.safeParse(prefsObj.reminders);
  if (parsed.success) return parsed.data;

  return {
    smsOptIn: row.smsOptIn,
    emailOptIn: row.emailFrequency !== "off",
    pushOptIn: DEFAULTS.pushOptIn,
    quietHours:
      row.quietHoursStart && row.quietHoursEnd
        ? { startHour: hourOf(row.quietHoursStart), endHour: hourOf(row.quietHoursEnd) }
        : null,
    timezone: DEFAULTS.timezone,
    preferredChannel: DEFAULTS.preferredChannel,
  };
}

/** Persist the current user's reminder prefs. Returns the validated prefs. */
export async function saveReminderPrefs(input: ChannelPrefs): Promise<ChannelPrefs> {
  const user = await requireUser();
  const prefs = ChannelPrefsSchema.parse(input);

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
  const mergedPreferences = { ...base, reminders: prefs } as Prisma.InputJsonValue;

  const data = {
    smsOptIn: prefs.smsOptIn,
    emailFrequency: prefs.emailOptIn ? "instant" : "off",
    quietHoursStart: prefs.quietHours ? pad(prefs.quietHours.startHour) : null,
    quietHoursEnd: prefs.quietHours ? pad(prefs.quietHours.endHour) : null,
    preferences: mergedPreferences,
  };

  await prisma.communicationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  return prefs;
}
