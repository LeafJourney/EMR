"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { applyFreezeToken } from "@/lib/gamification/streaks";

export async function applyFreezeTokenAction() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "No patient profile found." };

  const result = await applyFreezeToken(patient.id);
  if (!result.ok) return result;

  revalidatePath("/portal");
  return { ok: true };
}
