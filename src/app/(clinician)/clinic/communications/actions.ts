"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { ACTIVE_VISIT_STATUSES } from "@/lib/domain/visit-state";
import {
  startTelehealthVisit,
  endTelehealthVisit,
  type TelehealthVisitResult,
} from "../patients/[id]/telehealth/actions";

export interface OverlayTelehealthVisitResult extends TelehealthVisitResult {
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    presentingConcerns: string | null;
    medications: { name: string; dosage: string | null }[];
  };
  encounterId: string;
  providerName: string;
}

/**
 * Start a telehealth visit via the overlay command center.
 * Resolves the first active patient and finds or creates a video encounter.
 */
export async function startOverlayTelehealthVisit(): Promise<OverlayTelehealthVisitResult> {
  const user = await requireUser();
  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner")) {
    throw new Error("Clinician role required");
  }
  if (!user.organizationId) throw new Error("Organization context required");

  // Find the first non-deleted patient
  const patient = await prisma.patient.findFirst({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
    },
    include: {
      medications: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!patient) {
    throw new Error("No active patients found in the database to start a visit with.");
  }

  // Reuse any non-terminal video encounter for this patient (incl. ones the
  // front desk already checked in / roomed) before minting a new one — the old
  // scheduled/in_progress-only filter duplicated the encounter when a patient
  // pivoted to telehealth mid-flow.
  let encounter = await prisma.encounter.findFirst({
    where: {
      patientId: patient.id,
      organizationId: user.organizationId,
      modality: "video",
      status: { in: [...ACTIVE_VISIT_STATUSES] },
    },
    orderBy: { scheduledFor: "desc" },
  });

  if (!encounter) {
    encounter = await prisma.encounter.create({
      data: {
        organizationId: user.organizationId,
        patientId: patient.id,
        status: "in_progress",
        modality: "video",
        scheduledFor: new Date(),
        reason: "Telehealth consult via communications overlay",
      },
    });
  }

  const result = await startTelehealthVisit(patient.id, encounter.id);

  return {
    ...result,
    patient: {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      presentingConcerns: patient.presentingConcerns ?? null,
      medications: patient.medications.map((m) => ({
        name: m.name,
        dosage: m.dosage ?? null,
      })),
    },
    encounterId: encounter.id,
    providerName: `${user.firstName} ${user.lastName}`,
  };
}

/**
 * Fetch default patient details for overlay pre-visit preview.
 */
export async function fetchOverlayDefaultPatient() {
  const user = await requireUser();
  if (!user.organizationId) return null;

  const patient = await prisma.patient.findFirst({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      presentingConcerns: true,
    },
  });

  return patient;
}

/**
 * End a telehealth visit via the overlay command center.
 */
export async function endOverlayTelehealthVisit(roomName: string): Promise<void> {
  await endTelehealthVisit(roomName);
}
