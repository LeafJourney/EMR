"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// EMR-1079 (Back-Office Operations Audit §6.5) — refill queue, staff side.
// Refill *approval/signing* is clinical and already lives at
// /clinic/sign-off/refills. The back office's job is to route an incoming
// request to a provider. This action flags a `new` request for provider
// review; it deliberately does NOT approve, deny, or sign.

const REFILL_STAFF_ROLES = new Set<string>([
  "front_office",
  "back_office",
  "operator",
  "practice_owner",
  "practice_admin",
  "system",
]);

const FlagSchema = z.object({ refillId: z.string().min(1) });

export type RefillActionResult = { ok: true } | { ok: false; error: string };

export async function flagRefillForProvider(input: {
  refillId: string;
}): Promise<RefillActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Missing organization." };
  if (!user.roles.some((r) => REFILL_STAFF_ROLES.has(r))) {
    return { ok: false, error: "Forbidden." };
  }

  const parsed = FlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const refill = await prisma.refillRequest.findFirst({
    where: { id: parsed.data.refillId, organizationId: user.organizationId },
    select: { id: true, status: true },
  });
  if (!refill) return { ok: false, error: "Refill request not found." };

  if (refill.status === "flagged") {
    revalidatePath("/ops/refills");
    return { ok: true };
  }
  // Only an untriaged ("new") request can be routed from here. Approved/sent/
  // denied requests are past the staff routing step.
  if (refill.status !== "new") {
    return { ok: false, error: "Only a new request can be flagged for the provider." };
  }

  await prisma.refillRequest.update({
    where: { id: refill.id },
    data: { status: "flagged" },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "refill.flagged_for_provider",
      subjectType: "RefillRequest",
      subjectId: refill.id,
      metadata: { from: "new", to: "flagged" },
    },
  });

  revalidatePath("/ops/refills");
  return { ok: true };
}
