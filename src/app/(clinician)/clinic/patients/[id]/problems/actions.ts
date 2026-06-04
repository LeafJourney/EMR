"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import type { ProblemStatus } from "@/lib/domain/problem-list";

export async function addProblemAction(
  patientId: string,
  problem: {
    icd10: string;
    description: string;
    status: ProblemStatus;
    onsetDate?: string;
    notes?: string;
    addedBy: string;
  }
) {
  const user = await requireUser();
  const orgId = user.organizationId!;

  // Verify patient belongs to clinician's organization
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  // Condition is formatted as "icd10 | description"
  const condition = `${problem.icd10} | ${problem.description}`;

  // Serialize remaining fields into notes JSON
  const notesJson = JSON.stringify({
    status: problem.status,
    onsetDate: problem.onsetDate,
    notes: problem.notes,
    addedBy: problem.addedBy,
    addedAt: new Date().toISOString(),
  });

  const onsetYear = problem.onsetDate ? parseInt(problem.onsetDate.slice(0, 4), 10) : null;

  await prisma.pastMedicalCondition.create({
    data: {
      patientId,
      condition,
      onsetYear: isNaN(onsetYear as number) ? null : onsetYear,
      notes: notesJson,
      source: "clinician",
    },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  revalidatePath(`/clinic/patients/${patientId}/problems`);
  return { ok: true };
}

export async function updateProblemAction(
  patientId: string,
  id: string,
  patch: {
    status: ProblemStatus;
    onsetDate?: string;
    resolvedDate?: string;
    notes?: string;
    addedBy?: string;
    addedAt?: string;
  }
) {
  const user = await requireUser();
  const orgId = user.organizationId!;

  // Verify patient belongs to organization
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const existing = await prisma.pastMedicalCondition.findFirst({
    where: { id, patientId, deletedAt: null },
  });
  if (!existing) throw new Error("Condition not found");

  // Merge the patch into existing JSON notes
  let currentNotesData: any = {};
  if (existing.notes?.startsWith("{")) {
    try {
      currentNotesData = JSON.parse(existing.notes);
    } catch {
      currentNotesData = { notes: existing.notes };
    }
  } else {
    currentNotesData = { notes: existing.notes };
  }

  const updatedNotesData = {
    ...currentNotesData,
    status: patch.status,
    onsetDate: patch.onsetDate ?? currentNotesData.onsetDate,
    resolvedDate: patch.resolvedDate ?? currentNotesData.resolvedDate,
    notes: patch.notes ?? currentNotesData.notes,
    addedBy: patch.addedBy ?? currentNotesData.addedBy ?? `${user.firstName} ${user.lastName}`,
    addedAt: patch.addedAt ?? currentNotesData.addedAt ?? existing.createdAt.toISOString(),
  };

  const onsetYear = updatedNotesData.onsetDate ? parseInt(updatedNotesData.onsetDate.slice(0, 4), 10) : null;

  await prisma.pastMedicalCondition.update({
    where: { id },
    data: {
      notes: JSON.stringify(updatedNotesData),
      onsetYear: isNaN(onsetYear as number) ? null : onsetYear,
    },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  revalidatePath(`/clinic/patients/${patientId}/problems`);
  return { ok: true };
}

export async function deleteProblemAction(patientId: string, id: string) {
  const user = await requireUser();
  const orgId = user.organizationId!;

  // Verify patient belongs to organization
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  await prisma.pastMedicalCondition.updateMany({
    where: { id, patientId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  revalidatePath(`/clinic/patients/${patientId}/problems`);
  return { ok: true };
}
