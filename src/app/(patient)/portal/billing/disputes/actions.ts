"use server";

// EMR-068 — server actions for patient-filed statement disputes.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  canTransition,
  draftAiResolution,
  type DisputeReason,
  type DisputeStatus,
} from "@/lib/billing/dispute";

export async function fileDispute(formData: FormData) {
  const user = await requireRole("patient");
  const statementId = String(formData.get("statementId") ?? "");
  const reason = String(formData.get("reason") ?? "") as DisputeReason;
  const narrative = String(formData.get("narrative") ?? "").trim();
  const disputedAmountStr = String(formData.get("disputedAmount") ?? "").trim();
  const disputedAmountCents = disputedAmountStr
    ? Math.round(parseFloat(disputedAmountStr) * 100)
    : null;

  if (!statementId || !reason || narrative.length < 4) return;

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });
  if (!patient) throw new Error("FORBIDDEN");

  const statement = await prisma.statement.findUnique({
    where: { id: statementId },
    select: {
      id: true,
      patientId: true,
      statementNumber: true,
      totalChargesCents: true,
      insurancePaidCents: true,
      amountDueCents: true,
      lineItems: true,
    },
  });
  if (!statement || statement.patientId !== patient.id) {
    throw new Error("FORBIDDEN");
  }

  const lineItems = Array.isArray(statement.lineItems)
    ? (statement.lineItems as unknown as {
        description: string;
        amountCents: number;
        cptCode?: string;
      }[])
    : undefined;

  const aiDraft = draftAiResolution({
    reason,
    patientNarrative: narrative,
    disputedAmountCents,
    statement: {
      statementNumber: statement.statementNumber,
      totalChargesCents: statement.totalChargesCents,
      insurancePaidCents: statement.insurancePaidCents,
      amountDueCents: statement.amountDueCents,
      lineItems,
    },
  });

  await prisma.statementDispute.create({
    data: {
      organizationId: patient.organizationId,
      patientId: patient.id,
      statementId: statement.id,
      reason,
      patientNarrative: narrative,
      disputedAmountCents,
      aiDraftResolution: aiDraft,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "billing.statement.dispute.filed",
      subjectType: "Statement",
      subjectId: statement.id,
      metadata: { reason, disputedAmountCents },
    },
  });

  revalidatePath("/portal/billing/statements");
  revalidatePath("/portal/billing/disputes");
}

export async function withdrawDispute(formData: FormData) {
  const user = await requireRole("patient");
  const disputeId = String(formData.get("disputeId") ?? "");
  if (!disputeId) return;

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });
  if (!patient) throw new Error("FORBIDDEN");

  const dispute = await prisma.statementDispute.findUnique({
    where: { id: disputeId },
    select: { id: true, patientId: true, status: true, organizationId: true },
  });
  if (!dispute || dispute.patientId !== patient.id) {
    throw new Error("FORBIDDEN");
  }

  const transition = canTransition(
    dispute.status as DisputeStatus,
    "withdrawn",
  );
  if (!transition.ok) return;

  await prisma.statementDispute.update({
    where: { id: disputeId },
    data: { status: "withdrawn" },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: dispute.organizationId,
      actorUserId: user.id,
      action: "billing.statement.dispute.withdrawn",
      subjectType: "StatementDispute",
      subjectId: disputeId,
    },
  });
  revalidatePath("/portal/billing/disputes");
}
