"use server";

// Real persistence for patient-authorized record release (was sessionStorage
// only — authorizations silently vanished while the UI promised "your care team
// reviews every request"). Writes to the RecordReleaseRequest model, scoped to
// the signed-in patient.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_AUTHORIZATION_MONTHS,
  recordReleaseFromRow,
  type NewRecordReleaseInput,
  type RecordReleaseRequest,
} from "@/lib/domain/record-release";

async function requirePatientId(): Promise<string> {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) throw new Error("FORBIDDEN");
  return patient.id;
}

export async function listReleaseRequests(): Promise<RecordReleaseRequest[]> {
  const patientId = await requirePatientId();
  const rows = await prisma.recordReleaseRequest.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(recordReleaseFromRow);
}

export async function createReleaseRequest(
  input: NewRecordReleaseInput,
): Promise<{ ok: boolean; request?: RecordReleaseRequest }> {
  const patientId = await requirePatientId();

  const name = input.recipient.fullName?.trim();
  const hasContact = Boolean(
    input.recipient.email?.trim() ||
      input.recipient.fax?.trim() ||
      input.recipient.address?.trim(),
  );
  if (
    !name ||
    !hasContact ||
    input.categories.length === 0 ||
    input.patientSignatureName.trim().length < 3
  ) {
    return { ok: false };
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setMonth(
    expiresAt.getMonth() + (input.validForMonths ?? DEFAULT_AUTHORIZATION_MONTHS),
  );

  const row = await prisma.recordReleaseRequest.create({
    data: {
      patientId,
      status: "submitted",
      recipientName: name,
      recipientPractice: input.recipient.practice?.trim() || null,
      recipientEmail: input.recipient.email?.trim() || null,
      recipientFax: input.recipient.fax?.trim() || null,
      recipientAddress: input.recipient.address?.trim() || null,
      scope: input.scope,
      categories: input.categories,
      dateFrom: input.dateFrom ? new Date(input.dateFrom) : null,
      dateTo: input.dateTo ? new Date(input.dateTo) : null,
      patientSignatureName: input.patientSignatureName.trim(),
      patientSignedAt: now,
      expiresAt,
      reason: input.reason?.trim() || null,
    },
  });

  revalidatePath("/portal/records/release");
  return { ok: true, request: recordReleaseFromRow(row) };
}

export async function revokeReleaseRequest(id: string): Promise<{ ok: boolean }> {
  const patientId = await requirePatientId();
  // Scope to THIS patient's authorization so one patient can't revoke another's.
  const res = await prisma.recordReleaseRequest.updateMany({
    where: { id, patientId },
    data: { status: "revoked" },
  });
  revalidatePath("/portal/records/release");
  return { ok: res.count > 0 };
}
