"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { dispatch } from "@/lib/orchestration/dispatch";
import { logger } from "@/lib/observability/log";

/**
 * Start a visit: find or create an in-progress encounter for today,
 * dispatch the scribe draft event, attempt a quick inline run with a
 * timeout, and redirect to notes immediately.
 */
export async function startVisit(patientId: string) {
  const user = await requireUser();

  // Only clinicians and practice owners can start visits
  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner")) {
    redirect(`/clinic/patients/${patientId}?tab=notes&error=unauthorized`);
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });
  if (!patient) {
    redirect(`/clinic/patients/${patientId}?tab=notes&error=not_found`);
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  let encounter = await prisma.encounter.findFirst({
    where: {
      patientId,
      organizationId: user.organizationId!,
      status: "in_progress",
      createdAt: { gte: todayStart, lte: todayEnd },
    },
  });

  if (!encounter) {
    encounter = await prisma.encounter.create({
      data: {
        organizationId: user.organizationId!,
        patientId,
        status: "in_progress",
        modality: "in_person",
        reason: "Visit",
        startedAt: new Date(),
        scheduledFor: new Date(),
      },
    });
  }

  // Dispatch the scribe event — this enqueues the job
  const jobs = await dispatch({
    name: "encounter.note.draft.requested",
    encounterId: encounter.id,
    requestedBy: user.id,
  });

  // Try to run the agent inline with a 15-second timeout.
  // By running the specific job(s) returned by dispatch, we avoid
  // inadvertently pulling unrelated backlogged jobs from the queue.
  try {
    if (jobs.length > 0) {
      const jobRows = await prisma.agentJob.findMany({ where: { id: { in: jobs } } });
      const { runJob } = await import("@/lib/orchestration/runner");
      
      await Promise.race([
        Promise.all(jobRows.map(job => runJob(job, "inline-visit"))),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 15000)
        ),
      ]);
    }
  } catch (err) {
    // Timeout or error — the job is still in the queue.
    logger.error({ event: "clinic.start_visit.inline_failed", err });
  }

  // Query for the note the scribe just created (if any) and redirect
  // directly to it. If none exists yet, fall back to the notes tab
  // with a message so the clinician knows the scribe is processing.
  const latestNote = await prisma.note.findFirst({
    where: { encounterId: encounter.id },
    orderBy: { createdAt: "desc" },
  });

  revalidatePath(`/clinic/patients/${patientId}`);

  if (latestNote) {
    redirect(`/clinic/patients/${patientId}/notes/${latestNote.id}`);
  } else {
    redirect(`/clinic/patients/${patientId}?tab=notes&scribe=processing`);
  }
}

export async function saveAllergy(patientId: string, drugName: string, reaction: string) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const newAllergy = `${drugName}:${reaction}`;
  const allergies = [...(patient.allergies || [])];
  if (!allergies.includes(newAllergy)) {
    allergies.push(newAllergy);
  }

  await prisma.patient.update({
    where: { id: patientId },
    data: { allergies },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

export async function removeAllergen(patientId: string, allergyStr: string) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const allergies = (patient.allergies || []).filter((a) => a !== allergyStr);

  await prisma.patient.update({
    where: { id: patientId },
    data: { allergies },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

export async function updatePatientPhoto(patientId: string, base64Data: string) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const intake = (patient.intakeAnswers as Record<string, any>) ?? {};
  const updatedIntake = { ...intake, photoUrl: base64Data };

  await prisma.patient.update({
    where: { id: patientId },
    data: { intakeAnswers: updatedIntake as any },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  revalidatePath(`/portal/profile`);
  return { ok: true };
}

export async function updatePMHAndPSH(patientId: string, pmh: string[], psh: string[]) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const intake = (patient.intakeAnswers as Record<string, any>) ?? {};
  const updatedIntake = { ...intake, pastMedicalHistory: pmh, pastSurgicalHistory: psh };

  await prisma.patient.update({
    where: { id: patientId },
    data: { intakeAnswers: updatedIntake as any },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

export async function logCorrespondence(
  patientId: string,
  type: "email" | "call",
  subject: string,
  body: string,
  attachments?: { name: string; type: string; size: number; base64: string }[]
) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const now = new Date();

  // Create message thread
  const thread = await prisma.messageThread.create({
    data: {
      patientId,
      subject: type === "call" ? `Phone Call - ${now.toLocaleDateString()}` : subject,
      lastMessageAt: now,
    },
  });

  // Create message
  let messageBody = body;
  if (attachments && attachments.length > 0) {
    messageBody += "\n\nAttachments:";
    for (const att of attachments) {
      messageBody += `\n- ${att.name} (${Math.round(att.size / 1024)} KB)`;
      
      // Also create a Document entry in the database for this patient!
      await prisma.document.create({
        data: {
          organizationId: user.organizationId!,
          patientId,
          uploadedById: user.id,
          kind: "other",
          originalName: att.name,
          mimeType: att.type,
          sizeBytes: att.size,
          storageKey: `inline-attachment-${att.name}-${Date.now()}`,
        },
      });
    }
  }

  await prisma.message.create({
    data: {
      threadId: thread.id,
      senderUserId: user.id,
      status: "sent",
      body: messageBody,
      sentAt: now,
    },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}


