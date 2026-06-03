// EMR-063 — Pharmacy Communication Module: orchestration layer.
//
// Thin wrapper around the dual-signoff state machine. Talks to Prisma
// to persist threads, messages, change requests, and signoffs, and
// writes AuditLog rows on terminal transitions (sign-off, apply,
// reject). Business rules live in dual-signoff.ts; this file is the
// glue.

import type { PrismaClient, Prisma } from "@prisma/client";
import {
  addSignoff,
  canApply,
  computeStatus,
  validateAfterPayload,
  type ChangeRequestState,
  type Signoff,
  type SignoffParty,
  type SignoffDecision,
} from "./dual-signoff";

type Db = Pick<PrismaClient, "$transaction"> & {
  patient: PrismaClient["patient"];
  pharmacyCommThread: PrismaClient["pharmacyCommThread"];
  pharmacyCommMessage: PrismaClient["pharmacyCommMessage"];
  medicationChangeRequest: PrismaClient["medicationChangeRequest"];
  medicationChangeSignoff: PrismaClient["medicationChangeSignoff"];
  patientMedication: PrismaClient["patientMedication"];
  auditLog: PrismaClient["auditLog"];
};

export interface OpenThreadInput {
  organizationId: string;
  patientId: string;
  pharmacyContactId: string;
  openedById: string;
  subject: string;
  medicationId?: string;
  /** Optional opening message body */
  body?: string;
  senderName: string;
}

export async function openThread(db: Db, input: OpenThreadInput) {
  const patient = await db.patient.findUnique({
    where: { id: input.patientId },
    select: { organizationId: true },
  });
  if (!patient) {
    throw new Error("Patient not found.");
  }
  if (patient.organizationId !== input.organizationId) {
    throw new Error("Patient does not belong to the matching organization.");
  }

  if (input.medicationId) {
    const medication = await db.patientMedication.findUnique({
      where: { id: input.medicationId },
      select: { patientId: true },
    });
    if (!medication) {
      throw new Error("Medication not found.");
    }
    if (medication.patientId !== input.patientId) {
      throw new Error("Medication does not belong to this patient.");
    }
  }

  return db.pharmacyCommThread.create({
    data: {
      organizationId: input.organizationId,
      patientId: input.patientId,
      pharmacyContactId: input.pharmacyContactId,
      openedById: input.openedById,
      subject: input.subject,
      medicationId: input.medicationId,
      messages: input.body
        ? {
            create: [
              {
                senderRole: "provider",
                senderUserId: input.openedById,
                senderName: input.senderName,
                body: input.body,
              },
            ],
          }
        : undefined,
    },
    include: { messages: true },
  });
}

export interface PostMessageInput {
  threadId: string;
  senderUserId?: string;
  senderRole: "provider" | "pharmacist" | "agent" | "patient" | "system";
  senderName: string;
  body: string;
  attachments?: { url: string; name: string; mimeType: string }[];
}

export async function postMessage(db: Db, input: PostMessageInput) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const msg = await tx.pharmacyCommMessage.create({
      data: {
        threadId: input.threadId,
        senderRole: input.senderRole,
        senderUserId: input.senderUserId,
        senderName: input.senderName,
        body: input.body,
        attachments: (input.attachments ??
          []) as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.pharmacyCommThread.update({
      where: { id: input.threadId },
      data: { lastMessageAt: now },
    });
    return msg;
  });
}

export interface ProposeChangeInput {
  organizationId: string;
  threadId: string;
  patientId: string;
  proposedById: string;
  proposedByRole: "provider" | "pharmacist" | "agent";
  kind:
    | "new_medication"
    | "dose_change"
    | "discontinue"
    | "switch_product"
    | "formulary_substitute"
    | "refill_clarification";
  rationale: string;
  medicationId?: string;
  before?: Record<string, unknown>;
  after: Record<string, unknown>;
}

export async function proposeChange(db: Db, input: ProposeChangeInput) {
  const patient = await db.patient.findUnique({
    where: { id: input.patientId },
    select: { organizationId: true },
  });
  if (!patient) {
    throw new Error("Patient not found.");
  }
  if (patient.organizationId !== input.organizationId) {
    throw new Error("Patient does not belong to the matching organization.");
  }

  if (input.medicationId) {
    const medication = await db.patientMedication.findUnique({
      where: { id: input.medicationId },
      select: { patientId: true },
    });
    if (!medication) {
      throw new Error("Medication not found.");
    }
    if (medication.patientId !== input.patientId) {
      throw new Error("Medication does not belong to this patient.");
    }
  }

  // Defensive validation — the JSON blob is what we later write to
  // PatientMedication, so wrong shape here would silently corrupt
  // the chart. validateAfterPayload throws on missing fields.
  validateAfterPayload(input.after);

  return db.medicationChangeRequest.create({
    data: {
      organizationId: input.organizationId,
      threadId: input.threadId,
      patientId: input.patientId,
      medicationId: input.medicationId,
      proposedById: input.proposedById,
      proposedByRole: input.proposedByRole,
      kind: input.kind,
      rationale: input.rationale,
      beforeJson: input.before
        ? (input.before as unknown as Prisma.InputJsonValue)
        : undefined,
      afterJson: input.after as unknown as Prisma.InputJsonValue,
    },
  });
}

export interface SignChangeInput {
  requestId: string;
  party: SignoffParty;
  decision: SignoffDecision;
  signedById: string;
  signedName: string;
  npi?: string;
  comments?: string;
  organizationId: string;
}

export async function signChange(db: Db, input: SignChangeInput) {
  return db.$transaction(async (tx) => {
    const req = await tx.medicationChangeRequest.findUnique({
      where: { id: input.requestId },
      include: { signoffs: true },
    });
    if (!req) throw new Error("Change request not found.");
    if (req.organizationId !== input.organizationId) {
      throw new Error("Organization mismatch.");
    }

    const state: ChangeRequestState = {
      status: req.status as ChangeRequestState["status"],
      signoffs: req.signoffs.map(
        (s): Signoff => ({
          party: s.party as SignoffParty,
          decision: s.decision as SignoffDecision,
          signedById: s.signedById,
          signedName: s.signedName,
          npi: s.npi ?? undefined,
          comments: s.comments ?? undefined,
          signedAt: s.signedAt,
        }),
      ),
      appliedAt: req.appliedAt,
    };

    const nextSignoff: Signoff = {
      party: input.party,
      decision: input.decision,
      signedById: input.signedById,
      signedName: input.signedName,
      npi: input.npi,
      comments: input.comments,
      signedAt: new Date(),
    };

    const { nextStatus } = addSignoff(state, nextSignoff);

    await tx.medicationChangeSignoff.create({
      data: {
        requestId: input.requestId,
        party: input.party,
        signedById: input.signedById,
        signedName: input.signedName,
        npi: input.npi,
        decision: input.decision,
        comments: input.comments,
      },
    });

    const next = await tx.medicationChangeRequest.update({
      where: { id: input.requestId },
      data: {
        status: nextStatus,
        rejectedAt: nextStatus === "rejected" ? new Date() : undefined,
        rejectedReason:
          nextStatus === "rejected"
            ? input.comments ?? `Rejected by ${input.party}`
            : undefined,
      },
      include: { signoffs: true },
    });

    await tx.auditLog.create({
      data: {
        organizationId: req.organizationId,
        actorUserId: input.signedById,
        action: `pharmacy.medication_change.${input.party}.${input.decision}`,
        subjectType: "MedicationChangeRequest",
        subjectId: input.requestId,
        metadata: {
          requestId: input.requestId,
          party: input.party,
          decision: input.decision,
          previousStatus: state.status,
          nextStatus,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return next;
  });
}

export interface ApplyChangeInput {
  requestId: string;
  appliedById: string;
  organizationId: string;
}

/**
 * Applies a fully-signed change to PatientMedication. Refuses to run
 * unless both parties have approved. Writes an AuditLog row on apply.
 */
export async function applyChange(db: Db, input: ApplyChangeInput) {
  return db.$transaction(async (tx) => {
    const req = await tx.medicationChangeRequest.findUnique({
      where: { id: input.requestId },
      include: { signoffs: true },
    });
    if (!req) throw new Error("Change request not found.");
    if (req.organizationId !== input.organizationId) {
      throw new Error("Organization mismatch.");
    }

    const state: ChangeRequestState = {
      status: req.status as ChangeRequestState["status"],
      signoffs: req.signoffs.map(
        (s): Signoff => ({
          party: s.party as SignoffParty,
          decision: s.decision as SignoffDecision,
          signedById: s.signedById,
          signedName: s.signedName,
          npi: s.npi ?? undefined,
          comments: s.comments ?? undefined,
          signedAt: s.signedAt,
        }),
      ),
      appliedAt: req.appliedAt,
    };

    if (!canApply(state)) {
      throw new Error(
        `Cannot apply — change is in status "${state.status}" and needs to be fully signed by both pharmacist and provider first.`,
      );
    }

    const after = validateAfterPayload(req.afterJson);
    const now = new Date();

    if (req.medicationId) {
      // Update existing medication
      await tx.patientMedication.update({
        where: { id: req.medicationId },
        data: {
          active: after.active,
          name: after.name,
          genericName: after.genericName,
          dosage: after.dosage,
          prescriber: after.prescriber,
          notes: appendDiscontinueNote(after, req.kind),
        },
      });
    } else if (req.kind === "new_medication") {
      // Create a new medication row for the patient. `type` defaults
      // to "prescription" — the pharmacy-comm flow only deals with
      // prescribed meds. Cannabis dispenses use their own path
      // (src/lib/dispensary/cannabis-rx.ts).
      await tx.patientMedication.create({
        data: {
          patientId: req.patientId,
          name: after.name,
          genericName: after.genericName,
          dosage: after.dosage,
          prescriber: after.prescriber,
          notes: after.notes,
          active: after.active,
          type: "prescription",
        },
      });
    }

    const updated = await tx.medicationChangeRequest.update({
      where: { id: input.requestId },
      data: {
        status: "applied",
        appliedAt: now,
        appliedById: input.appliedById,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: req.organizationId,
        actorUserId: input.appliedById,
        action: "pharmacy.medication_change.applied",
        subjectType: "MedicationChangeRequest",
        subjectId: input.requestId,
        metadata: {
          kind: req.kind,
          before: req.beforeJson ?? null,
          after,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return updated;
  });
}

function appendDiscontinueNote(
  after: ReturnType<typeof validateAfterPayload>,
  kind: string,
): string | null | undefined {
  if (kind !== "discontinue" || !after.discontinuedReason) return after.notes;
  const stamp = `[discontinued] ${after.discontinuedReason}`;
  return after.notes ? `${after.notes}\n${stamp}` : stamp;
}
