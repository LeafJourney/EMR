"use server";

/**
 * EMR-214 — Provider scheduling-guardrail persistence (REAL, DB-backed).
 *
 * Promotes the burnout-guardrail caps off the interim localStorage store onto
 * the same per-user `CommunicationPreference` row used by reminders (EMR-211),
 * under a distinct `preferences.schedulingPrefs` key — a provider is a user, so
 * no schema change is needed. Reminders and scheduling prefs coexist in the
 * JSON (each save merges, never clobbers the other).
 */

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { Prisma } from "@prisma/client";
import {
  ProviderPrefsSchema,
  DEFAULT_PROVIDER_PREFS,
  type ProviderPrefs,
} from "@/lib/scheduling/provider-prefs";

// Stored shape = ProviderPrefs without the providerId (that's contextual).
const StoredSchedulingPrefsSchema = ProviderPrefsSchema.omit({ providerId: true });

function readBase(
  preferences: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  return preferences && typeof preferences === "object" && !Array.isArray(preferences)
    ? (preferences as Record<string, unknown>)
    : {};
}

/** Read a user's stored scheduling caps, or the defaults. Server-component safe. */
export async function loadSchedulingPrefs(
  userId: string,
): Promise<Omit<ProviderPrefs, "providerId">> {
  const row = await prisma.communicationPreference.findUnique({ where: { userId } });
  const parsed = StoredSchedulingPrefsSchema.safeParse(
    readBase(row?.preferences).schedulingPrefs,
  );
  return parsed.success ? parsed.data : DEFAULT_PROVIDER_PREFS;
}

/** Persist the current user's scheduling caps. Returns the validated prefs. */
export async function saveSchedulingPrefs(
  input: Omit<ProviderPrefs, "providerId">,
): Promise<Omit<ProviderPrefs, "providerId">> {
  const user = await requireUser();
  const prefs = StoredSchedulingPrefsSchema.parse(input);

  const existing = await prisma.communicationPreference.findUnique({
    where: { userId: user.id },
    select: { preferences: true },
  });
  const merged = {
    ...readBase(existing?.preferences),
    schedulingPrefs: prefs,
  } as Prisma.InputJsonValue;

  await prisma.communicationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, preferences: merged },
    update: { preferences: merged },
  });

  return prefs;
}
