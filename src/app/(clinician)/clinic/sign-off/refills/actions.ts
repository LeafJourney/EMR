"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// MALLIK-007 — Refill Queue server actions

export type RefillActionResult =
  | { ok: true; newStatus: "approved" | "denied" }
  | { ok: false; error: string };

/**
 * Approve a refill. Phase 1 stubs the delivery side — we mark the refill
 * `approved` and drop an AuditLog row. The Surescripts send path lands in
 * Phase 2 (MALLIK-012); the fax-PDF stub lands when the batch tray ships.
 */
export async function approveRefillAction(
  refillRequestId: string
): Promise<RefillActionResult> {
  const user = await requireUser();
  const refill = await prisma.refillRequest.findUnique({
    where: { id: refillRequestId },
    select: {
      id: true,
      organizationId: true,
      signedAt: true,
      medication: { select: { name: true } },
      safetyFlags: true,
    },
  });
  if (!refill) return { ok: false, error: "Refill not found." };
  if (refill.organizationId !== user.organizationId) {
    return { ok: false, error: "Forbidden." };
  }
  if (refill.signedAt) {
    return { ok: false, error: "This refill is already signed." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.refillRequest.update({
      where: { id: refill.id },
      data: {
        status: "approved",
        signedById: user.id,
        signedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: refill.organizationId,
        actorUserId: user.id,
        action: "refillRequest.approved",
        subjectType: "RefillRequest",
        subjectId: refill.id,
        metadata: {
          medication: refill.medication.name,
          flagCount: Array.isArray(refill.safetyFlags)
            ? refill.safetyFlags.length
            : 0,
        },
      },
    });
  });

  revalidatePath("/clinic/refills");
  revalidatePath("/clinic/sign-off/refills");
  return { ok: true, newStatus: "approved" };
}

/**
 * Deny a refill with a short reason. Writes status "denied" and audits.
 * The reason is stored for downstream patient-facing communication; how
 * that message is routed is Phase 3 outreach work.
 */
export async function denyRefillAction(
  refillRequestId: string,
  reason: string
): Promise<RefillActionResult> {
  const user = await requireUser();
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, error: "Please provide a reason for denial." };
  }

  const refill = await prisma.refillRequest.findUnique({
    where: { id: refillRequestId },
    select: {
      id: true,
      organizationId: true,
      signedAt: true,
      medication: { select: { name: true } },
    },
  });
  if (!refill) return { ok: false, error: "Refill not found." };
  if (refill.organizationId !== user.organizationId) {
    return { ok: false, error: "Forbidden." };
  }
  if (refill.signedAt) {
    return { ok: false, error: "This refill is already signed." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.refillRequest.update({
      where: { id: refill.id },
      data: {
        status: "denied",
        signedById: user.id,
        signedAt: new Date(),
        deniedReason: trimmed,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: refill.organizationId,
        actorUserId: user.id,
        action: "refillRequest.denied",
        subjectType: "RefillRequest",
        subjectId: refill.id,
        metadata: {
          medication: refill.medication.name,
          reason: trimmed,
        },
      },
    });
  });

  revalidatePath("/clinic/refills");
  revalidatePath("/clinic/sign-off/refills");
  return { ok: true, newStatus: "denied" };
}
