"use server";

// EMR-063 — server actions for the pharmacy thread detail page.
// All actions guard on the user being part of the thread's
// organization; the dual sign-off rules are enforced inside
// src/lib/pharmacy/communication.ts so this layer stays thin.

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  postMessage,
  proposeChange,
  signChange,
  applyChange,
} from "@/lib/pharmacy/communication";

async function ensureThreadOrg(threadId: string, organizationId: string | null) {
  if (!organizationId) throw new Error("FORBIDDEN");
  const thread = await prisma.pharmacyCommThread.findUnique({
    where: { id: threadId },
    select: { id: true, organizationId: true },
  });
  if (!thread || thread.organizationId !== organizationId) {
    throw new Error("FORBIDDEN");
  }
  return thread;
}

export async function postMessageAction(formData: FormData) {
  const user = await requireUser();
  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!threadId || !body) return;
  await ensureThreadOrg(threadId, user.organizationId);

  await postMessage(prisma, {
    threadId,
    senderRole: "provider",
    senderUserId: user.id,
    senderName: `${user.firstName} ${user.lastName}`.trim(),
    body,
  });
  revalidatePath(`/clinic/pharmacy/${threadId}`);
}

export async function proposeChangeAction(formData: FormData) {
  const user = await requireUser();
  const threadId = String(formData.get("threadId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  const medicationId = String(formData.get("medicationId") ?? "") || undefined;
  const kind = String(formData.get("kind") ?? "");
  const rationale = String(formData.get("rationale") ?? "").trim();
  const newName = String(formData.get("newName") ?? "").trim();
  const newDosage = String(formData.get("newDosage") ?? "").trim() || undefined;
  if (!threadId || !patientId || !rationale || !newName) return;
  if (!user.organizationId) throw new Error("FORBIDDEN");
  await ensureThreadOrg(threadId, user.organizationId);

  await proposeChange(prisma, {
    organizationId: user.organizationId,
    threadId,
    patientId,
    proposedById: user.id,
    proposedByRole: "provider",
    kind: kind as never,
    rationale,
    medicationId,
    after: {
      active: kind !== "discontinue",
      name: newName,
      dosage: newDosage,
      prescriber: `${user.firstName} ${user.lastName}`.trim(),
    },
  });
  revalidatePath(`/clinic/pharmacy/${threadId}`);
}

export async function signChangeAction(formData: FormData) {
  const user = await requireUser();
  const threadId = String(formData.get("threadId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const party = String(formData.get("party") ?? "") as "pharmacist" | "provider";
  const comments = String(formData.get("comments") ?? "").trim() || undefined;
  if (!requestId || !threadId) return;
  if (!user.organizationId) throw new Error("FORBIDDEN");
  await ensureThreadOrg(threadId, user.organizationId);

  await signChange(prisma, {
    requestId,
    party,
    decision: decision as "approve" | "reject",
    signedById: user.id,
    signedName: `${user.firstName} ${user.lastName}`.trim(),
    comments,
    organizationId: user.organizationId,
  });
  revalidatePath(`/clinic/pharmacy/${threadId}`);
}

export async function applyChangeAction(formData: FormData) {
  const user = await requireUser();
  const threadId = String(formData.get("threadId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId || !threadId) return;
  if (!user.organizationId) throw new Error("FORBIDDEN");
  await ensureThreadOrg(threadId, user.organizationId);

  await applyChange(prisma, {
    requestId,
    appliedById: user.id,
    organizationId: user.organizationId,
  });
  revalidatePath(`/clinic/pharmacy/${threadId}`);
}
