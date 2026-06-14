"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { assertChartAccess, requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { parseSpokenIntent } from "@/lib/clinical/spoken-intent/parse-intent";
import type { DraftOrder } from "@/lib/clinical/spoken-intent/types";

// ---------------------------------------------------------------------------
// EMR-1157 — Spoken-intent order drafting: stage / sign / discard.
//
// Drafts persist as ClinicalOrder rows with status="draft" (free-string status
// — no migration). Nothing transmits while a row is a draft. "Authorize & Sign"
// flips draft→placed (labs route to the diagnostic center, simulated) and drops
// lifestyle CarePlans to the patient app via a portal Notification.
// ---------------------------------------------------------------------------

const ORDER_TYPE_FOR_KIND: Record<DraftOrder["kind"], string> = {
  lab: "lab",
  imaging: "imaging",
  lifestyle: "lifestyle",
};

export interface CheckoutDraft {
  id: string;
  orderType: string;
  resourceType: DraftOrder["resourceType"];
  code: { system: string; code: string; display: string };
  name: string;
  occurrenceLabel: string | null;
  fastingInstruction: string | null;
  detail: string | null;
  confidence: number;
}

export type StageResult =
  | { ok: true; staged: CheckoutDraft[]; lowConfidence: DraftOrder[] }
  | { ok: false; error: string };

function toCheckoutDraft(row: {
  id: string;
  orderType: string;
  orderCode: string;
  orderName: string;
  payload: unknown;
}): CheckoutDraft {
  const p = (row.payload ?? {}) as Partial<DraftOrder> & { system?: string };
  return {
    id: row.id,
    orderType: row.orderType,
    resourceType: p.resourceType ?? "ServiceRequest",
    code: {
      system: p.code?.system ?? "internal",
      code: p.code?.code ?? row.orderCode,
      display: p.code?.display ?? row.orderName,
    },
    name: row.orderName,
    occurrenceLabel: p.occurrencePeriod?.label ?? null,
    fastingInstruction: p.fasting?.instruction ?? null,
    detail: p.detail ?? null,
    confidence: typeof p.confidence === "number" ? p.confidence : 1,
  };
}

const stageSchema = z.object({
  patientId: z.string().min(1),
  encounterId: z.string().min(1).nullable().optional(),
  utterance: z.string().min(1).max(2000),
});

/** Parse a directive and stage the high-confidence drafts in the checkout queue. */
export async function stageSpokenIntent(input: {
  patientId: string;
  encounterId?: string | null;
  utterance: string;
}): Promise<StageResult> {
  const user = await requireUser();
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  try {
    await assertChartAccess(user, parsed.data.patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "You don't have access to this chart." };
    throw err;
  }

  const result = parseSpokenIntent(parsed.data.utterance);
  if (result.drafts.length === 0) {
    return { ok: true, staged: [], lowConfidence: result.lowConfidence };
  }

  // Skip drafts already staged for this encounter (idempotent re-dictation).
  const existing = await prisma.clinicalOrder.findMany({
    where: {
      patientId: parsed.data.patientId,
      encounterId: parsed.data.encounterId ?? undefined,
      status: "draft",
    },
    select: { orderCode: true },
  });
  const have = new Set(existing.map((o) => o.orderCode));

  const orderedByName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
  const created: CheckoutDraft[] = [];

  for (const draft of result.drafts) {
    if (have.has(draft.code.code)) continue;
    const row = await prisma.clinicalOrder.create({
      data: {
        organizationId: user.organizationId!,
        patientId: parsed.data.patientId,
        encounterId: parsed.data.encounterId ?? null,
        orderType: ORDER_TYPE_FOR_KIND[draft.kind],
        orderCode: draft.code.code,
        orderName: draft.name,
        priority: "routine",
        diagnosisCodes: [] as unknown as Prisma.InputJsonValue,
        payload: { ...draft, sourceUtterance: parsed.data.utterance } as unknown as Prisma.InputJsonValue,
        status: "draft",
        transmissionMode: "simulated",
        orderedById: user.id,
        orderedByName,
      },
      select: { id: true, orderType: true, orderCode: true, orderName: true, payload: true },
    });
    created.push(toCheckoutDraft(row));
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: "order.intent.drafted",
      subjectType: "Patient",
      subjectId: parsed.data.patientId,
      metadata: {
        staged: created.length,
        lowConfidence: result.lowConfidence.length,
        codes: created.map((c) => c.code.code),
      } as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/clinic/patients/${parsed.data.patientId}/orders`);
  return { ok: true, staged: created, lowConfidence: result.lowConfidence };
}

/** List the patient's (optionally encounter-scoped) draft checkout queue. */
export async function getCheckoutQueue(
  patientId: string,
  encounterId?: string | null,
): Promise<{ ok: true; drafts: CheckoutDraft[] } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "No access." };
    throw err;
  }
  const rows = await prisma.clinicalOrder.findMany({
    where: { patientId, status: "draft", ...(encounterId ? { encounterId } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true, orderType: true, orderCode: true, orderName: true, payload: true },
  });
  return { ok: true, drafts: rows.map(toCheckoutDraft) };
}

/** Authorize & sign drafts: draft → placed; labs route out, lifestyle → patient app. */
export async function signSpokenIntentOrders(
  orderIds: string[],
): Promise<{ ok: true; signed: number } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { ok: false, error: "Nothing to sign." };
  }

  const rows = await prisma.clinicalOrder.findMany({
    where: { id: { in: orderIds }, status: "draft", organizationId: user.organizationId! },
    select: { id: true, patientId: true, orderType: true, orderName: true },
  });
  if (rows.length === 0) return { ok: false, error: "No matching drafts to sign." };

  try {
    requirePermission(user, "labs.sign");
    await assertChartAccess(user, rows[0].patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "You don't have permission to sign orders." };
    throw err;
  }

  const now = new Date();
  for (const row of rows) {
    const isLifestyle = row.orderType === "lifestyle";
    await prisma.clinicalOrder.update({
      where: { id: row.id },
      data: {
        status: "placed",
        transmissionMode: isLifestyle ? "patient_app" : "simulated",
        updatedAt: now,
      },
    });

    if (isLifestyle) {
      const patient = await prisma.patient.findUnique({
        where: { id: row.patientId },
        select: { userId: true },
      });
      if (patient?.userId) {
        await prisma.notification.create({
          data: {
            userId: patient.userId,
            type: "lifestyle_rx",
            priority: "normal",
            title: "New plan from your care team",
            body: `Your care team added "${row.orderName}" to your plan. Open the app to see the details.`,
            href: "/portal/care-plan",
          },
        });
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: "order.intent.signed",
      subjectType: "Patient",
      subjectId: rows[0].patientId,
      metadata: { signed: rows.map((r) => r.id) } as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath(`/clinic/patients/${rows[0].patientId}/orders`);
  return { ok: true, signed: rows.length };
}

/** Discard a draft from the checkout queue (status → cancelled). */
export async function discardDraft(
  orderId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const row = await prisma.clinicalOrder.findFirst({
    where: { id: orderId, status: "draft", organizationId: user.organizationId! },
    select: { id: true, patientId: true },
  });
  if (!row) return { ok: false, error: "Draft not found." };
  try {
    await assertChartAccess(user, row.patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "No access." };
    throw err;
  }
  await prisma.clinicalOrder.update({ where: { id: row.id }, data: { status: "cancelled" } });
  revalidatePath(`/clinic/patients/${row.patientId}/orders`);
  return { ok: true };
}
