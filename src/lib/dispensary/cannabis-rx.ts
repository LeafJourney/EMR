// EMR-091 — Cannabis Rx + dispense orchestration.
//
// Talks to Prisma; delegates all eligibility/quantity/state rules to
// the pure helpers in medical-cannabis.ts. Every mutation here writes
// an AuditLog row and is wrapped in a transaction.

import type { PrismaClient, Prisma } from "@prisma/client";
import {
  checkCardEligibility,
  checkDispenseBounds,
  dispenseToMedication,
  validateBudtenderSignature,
  type RxStatus,
} from "./medical-cannabis";

type Db = Pick<PrismaClient, "$transaction"> & {
  medicalCannabisCard: PrismaClient["medicalCannabisCard"];
  cannabisRx: PrismaClient["cannabisRx"];
  dispensaryDispense: PrismaClient["dispensaryDispense"];
  patientMedication: PrismaClient["patientMedication"];
  curesPdmpCheck: PrismaClient["curesPdmpCheck"];
  auditLog: PrismaClient["auditLog"];
};

// --------------------------------------------------------------
// MMJ Card
// --------------------------------------------------------------

export interface VerifyCardInput {
  cardId: string;
  verifiedById: string;
  /** Inject the clock for tests; defaults to new Date(). */
  now?: Date;
}

export async function verifyCard(db: Db, input: VerifyCardInput) {
  return db.$transaction(async (tx) => {
    const card = await tx.medicalCannabisCard.findUnique({
      where: { id: input.cardId },
    });
    if (!card) throw new Error("Card not found.");
    const eligibility = checkCardEligibility({
      status: card.status as never,
      expiresOn: card.expiresOn,
      now: input.now,
    });
    if (!eligibility.eligible) throw new Error(eligibility.reason);

    const updated = await tx.medicalCannabisCard.update({
      where: { id: input.cardId },
      data: { verifiedAt: input.now ?? new Date(), verifiedById: input.verifiedById },
    });
    await tx.auditLog.create({
      data: {
        organizationId: card.organizationId,
        actorUserId: input.verifiedById,
        action: "cannabis.card.verified",
        subjectType: "MedicalCannabisCard",
        subjectId: input.cardId,
      },
    });
    return updated;
  });
}

// --------------------------------------------------------------
// Cannabis Rx
// --------------------------------------------------------------

export interface CreateRxInput {
  organizationId: string;
  patientId: string;
  providerId: string;
  cardId: string;
  dispensaryId: string;
  skuId?: string;
  productName: string;
  productFormat: string;
  thcMgPerUnit?: number;
  cbdMgPerUnit?: number;
  quantity: number;
  unit: string;
  refills?: number;
  daysSupply?: number;
  doseInstructions: string;
  diagnosisCodes?: string[];
  expiresOn?: Date;
  notes?: string;
  /** Inject clock for tests; defaults to new Date(). */
  now?: Date;
}

export async function createRx(db: Db, input: CreateRxInput) {
  // Block creation if the patient's MMJ card is not currently valid.
  const card = await db.medicalCannabisCard.findUnique({
    where: { id: input.cardId },
    select: { id: true, patientId: true, status: true, expiresOn: true },
  });
  if (!card) throw new Error("Medical cannabis card not found.");
  if (card.patientId !== input.patientId) {
    throw new Error("Card does not belong to this patient.");
  }
  const eligibility = checkCardEligibility({
    status: card.status as never,
    expiresOn: card.expiresOn,
    now: input.now,
  });
  if (!eligibility.eligible) throw new Error(eligibility.reason);

  return db.cannabisRx.create({
    data: {
      organizationId: input.organizationId,
      patientId: input.patientId,
      providerId: input.providerId,
      cardId: input.cardId,
      dispensaryId: input.dispensaryId,
      skuId: input.skuId,
      productName: input.productName,
      productFormat: input.productFormat,
      thcMgPerUnit: input.thcMgPerUnit,
      cbdMgPerUnit: input.cbdMgPerUnit,
      quantity: input.quantity,
      unit: input.unit,
      refills: input.refills ?? 0,
      daysSupply: input.daysSupply,
      doseInstructions: input.doseInstructions,
      diagnosisCodes: input.diagnosisCodes ?? [],
      expiresOn: input.expiresOn,
      notes: input.notes,
    },
  });
}

export interface SendRxInput {
  rxId: string;
  signedById: string;
}

export async function sendRxToDispensary(db: Db, input: SendRxInput) {
  return db.$transaction(async (tx) => {
    const rx = await tx.cannabisRx.findUnique({ where: { id: input.rxId } });
    if (!rx) throw new Error("Rx not found.");
    if (rx.status !== "draft") {
      throw new Error(`Rx is in status "${rx.status}" — only drafts can be sent.`);
    }
    const updated = await tx.cannabisRx.update({
      where: { id: input.rxId },
      data: {
        status: "sent_to_dispensary",
        sentAt: new Date(),
        signedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: rx.organizationId,
        actorUserId: input.signedById,
        action: "cannabis.rx.sent",
        subjectType: "CannabisRx",
        subjectId: rx.id,
      },
    });
    return updated;
  });
}

// --------------------------------------------------------------
// Dispense — the canonical handoff event.
// --------------------------------------------------------------

export interface RecordDispenseInput {
  organizationId: string;
  dispensaryId: string;
  patientId: string;
  cardId: string;
  rxId?: string;
  skuId?: string;
  productName: string;
  productSku: string;
  quantity: number;
  unit: string;
  totalCents: number;
  thcMgPerUnit?: number | null;
  cbdMgPerUnit?: number | null;
  budtenderName: string;
  budtenderLicense?: string;
  budtenderSignature: string;
  doseInstructions?: string | null;
  prescriber?: string | null;
  notes?: string;
  /** Inject clock for tests; defaults to new Date(). */
  now?: Date;
  /** When true, skip creating a PatientMedication row (e.g. backfills). */
  skipMedicationAutoPopulate?: boolean;
}

/**
 * Records a dispense and (when not skipped) auto-populates a
 * PatientMedication row so the chart timeline reflects the new
 * product. Refuses to run if:
 *   - the patient's MMJ card is not eligible
 *   - the budtender signature is missing/placeholder
 *   - the Rx exists and dispensing this quantity would exceed bounds
 *
 * Wrapped in a transaction so a failed sub-step rolls back the row.
 */
export async function recordDispense(db: Db, input: RecordDispenseInput) {
  const now = input.now ?? new Date();

  // 1) Validate budtender signature up-front (pure, cheap)
  const sigCheck = validateBudtenderSignature({
    budtenderName: input.budtenderName,
    budtenderSignature: input.budtenderSignature,
  });
  if (!sigCheck.ok) throw new Error(sigCheck.reason);

  return db.$transaction(async (tx) => {
    // 2) Card eligibility
    const card = await tx.medicalCannabisCard.findUnique({
      where: { id: input.cardId },
    });
    if (!card) throw new Error("Medical cannabis card not found.");
    if (card.patientId !== input.patientId) {
      throw new Error("Card does not belong to this patient.");
    }
    const eligibility = checkCardEligibility({
      status: card.status as never,
      expiresOn: card.expiresOn,
      now,
    });
    if (!eligibility.eligible) throw new Error(eligibility.reason);

    // 3) Rx bounds (when this dispense is tied to one)
    let rxFinalFill = false;
    if (input.rxId) {
      const rx = await tx.cannabisRx.findUnique({ where: { id: input.rxId } });
      if (!rx) throw new Error("Rx not found.");
      if (rx.patientId !== input.patientId) {
        throw new Error("Rx does not belong to this patient.");
      }
      if (
        rx.status !== "approved_by_dispensary" &&
        rx.status !== "partially_dispensed"
      ) {
        throw new Error(
          `Rx is in status "${rx.status}" — must be approved or partially dispensed.`,
        );
      }
      const prior = await tx.dispensaryDispense.aggregate({
        where: { rxId: rx.id },
        _sum: { quantity: true },
      });
      const already = prior._sum.quantity ?? 0;
      const bounds = checkDispenseBounds({
        rxQuantity: rx.quantity,
        rxRefills: rx.refills,
        alreadyDispensedQuantity: already,
        requestedQuantity: input.quantity,
      });
      if (!bounds.ok) throw new Error(bounds.reason);
      rxFinalFill = bounds.isFinalFill;
    }

    // 4) Insert the dispense row
    const dispense = await tx.dispensaryDispense.create({
      data: {
        organizationId: input.organizationId,
        dispensaryId: input.dispensaryId,
        patientId: input.patientId,
        cardId: input.cardId,
        rxId: input.rxId,
        skuId: input.skuId,
        productName: input.productName,
        productSku: input.productSku,
        quantity: input.quantity,
        unit: input.unit,
        totalCents: input.totalCents,
        thcMgPerUnit: input.thcMgPerUnit ?? undefined,
        cbdMgPerUnit: input.cbdMgPerUnit ?? undefined,
        budtenderName: input.budtenderName,
        budtenderLicense: input.budtenderLicense,
        budtenderSignature: input.budtenderSignature,
        dispensedAt: now,
        notes: input.notes,
      },
    });

    // 5) Update the Rx state if attached
    if (input.rxId) {
      await tx.cannabisRx.update({
        where: { id: input.rxId },
        data: {
          status: rxFinalFill ? "fully_dispensed" : "partially_dispensed",
        },
      });
    }

    // 6) Auto-populate PatientMedication
    if (!input.skipMedicationAutoPopulate) {
      const medPayload = dispenseToMedication({
        productName: input.productName,
        productSku: input.productSku,
        quantity: input.quantity,
        unit: input.unit,
        thcMgPerUnit: input.thcMgPerUnit ?? null,
        cbdMgPerUnit: input.cbdMgPerUnit ?? null,
        dispensedAt: now,
        doseInstructions: input.doseInstructions ?? null,
        prescriber: input.prescriber ?? null,
      });
      await tx.patientMedication.create({
        data: {
          patientId: input.patientId,
          name: medPayload.name,
          dosage: medPayload.dosage,
          prescriber: medPayload.prescriber,
          notes: medPayload.notes,
          type: medPayload.type,
          active: medPayload.active,
          startDate: medPayload.startDate,
        },
      });
    }

    // 7) Audit
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: null,
        actorAgent: "agent:dispensary-pos",
        action: "cannabis.dispense.recorded",
        subjectType: "DispensaryDispense",
        subjectId: dispense.id,
        metadata: {
          rxId: input.rxId ?? null,
          quantity: input.quantity,
          unit: input.unit,
          totalCents: input.totalCents,
          budtenderName: input.budtenderName,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return dispense;
  });
}

// --------------------------------------------------------------
// CURES / PDMP — optional pre-Rx safety check
// --------------------------------------------------------------

export interface RunPdmpCheckInput {
  organizationId: string;
  patientId: string;
  requestedById: string;
  jurisdiction: string;
  pdmpSystem: string;
  flags: (
    | "conflicting_scripts"
    | "early_refill"
    | "multiple_prescribers"
    | "multiple_pharmacies"
    | "controlled_substance_combo"
    | "no_findings"
  )[];
  rawResponse?: Record<string, unknown>;
  queryReference?: string;
}

/**
 * Persists a PDMP query result. Production wiring should hit
 * cures.doj.gov for CA patients (or the state's equivalent) and pass
 * the parsed flags here. The unit test exercises the persistence path
 * with a stubbed flag set.
 */
export async function recordPdmpCheck(db: Db, input: RunPdmpCheckInput) {
  return db.curesPdmpCheck.create({
    data: {
      organizationId: input.organizationId,
      patientId: input.patientId,
      requestedById: input.requestedById,
      jurisdiction: input.jurisdiction,
      pdmpSystem: input.pdmpSystem,
      queryReference: input.queryReference,
      flags: input.flags,
      rawResponse: input.rawResponse
        ? (input.rawResponse as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  });
}

/**
 * Rx + dispense status helper — kept here so callers can re-use the
 * same transition vocabulary the state machine uses internally.
 */
export type { RxStatus };
