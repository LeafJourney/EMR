"use server";

// EMR-1116 (PJ-4 / PJ-M3) — patient-initiated refill requests.
//
// The clinic refill queue (/clinic/sign-off/refills) reads RefillRequest rows
// where { organizationId, status in ["new","flagged"], signedAt: null } and
// displays the linked PatientMedication (name/dosage/type) plus the
// denormalized pharmacy fields. RefillRequest is keyed on PatientMedication,
// not DosingRegimen, so a portal request for a cannabis regimen bridges
// through a find-or-create PatientMedication row (type "cannabis", named
// after the regimen's product). Dedupe is per bridged medication: one open
// (new/flagged, unsigned) request at a time.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";

const requestSchema = z.object({
  regimenId: z.string().min(1),
  daysSupply: z.coerce.number().int().min(7).max(90),
  /** Org PharmacyContact id, or empty for clinic-dispensary pickup. */
  pharmacyContactId: z.string().max(64).optional(),
});

export type RequestRefillInput = z.infer<typeof requestSchema>;

export type RequestRefillResult =
  | { ok: true; refillRequestId: string }
  | { ok: false; error: string };

/** Statuses that count as "still open" for dedupe + patient-facing pending state. */
const OPEN_STATUSES = ["new", "flagged"];

export async function requestRefillAction(
  input: RequestRefillInput,
): Promise<RequestRefillResult> {
  const user = await requireRole("patient");

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid refill request." };
  }
  const { regimenId, daysSupply, pharmacyContactId } = parsed.data;

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });
  if (!patient) return { ok: false, error: "No patient profile found." };

  // Patient-scope: the regimen must belong to this patient and be active.
  const regimen = await prisma.dosingRegimen.findFirst({
    where: { id: regimenId, patientId: patient.id, active: true },
    include: { product: { select: { name: true } } },
  });
  if (!regimen) {
    return { ok: false, error: "Medication not found." };
  }

  const medicationName = regimen.product?.name ?? "Cannabis product";
  const dosage = `${regimen.volumePerDose} ${regimen.volumeUnit}, ${regimen.frequencyPerDay}x daily`;

  // Bridge DosingRegimen → PatientMedication (the queue's key).
  let medication = await prisma.patientMedication.findFirst({
    where: {
      patientId: patient.id,
      name: medicationName,
      type: "cannabis",
      active: true,
    },
    select: { id: true },
  });
  if (!medication) {
    medication = await prisma.patientMedication.create({
      data: {
        patientId: patient.id,
        name: medicationName,
        type: "cannabis",
        dosage,
        active: true,
        startDate: regimen.startDate,
        notes: `Linked to dosing regimen ${regimen.id} (portal refill request).`,
      },
      select: { id: true },
    });
  }

  // Idempotency: block a duplicate while one is still open in the queue.
  const openRequest = await prisma.refillRequest.findFirst({
    where: {
      patientId: patient.id,
      medicationId: medication.id,
      status: { in: OPEN_STATUSES },
      signedAt: null,
    },
    select: { id: true },
  });
  if (openRequest) {
    return {
      ok: false,
      error: "A refill request for this medication is already pending review.",
    };
  }

  // Pickup preference. RefillRequest denormalizes pharmacy name/phone/address;
  // default is clinic-dispensary pickup when no external pharmacy is chosen.
  let pharmacy: {
    pharmacyName: string;
    pharmacyPhone: string | null;
    pharmacyAddress: string | null;
  } = {
    pharmacyName: "Clinic dispensary — pickup",
    pharmacyPhone: null,
    pharmacyAddress: null,
  };
  if (pharmacyContactId) {
    const contact = await prisma.pharmacyContact.findFirst({
      where: {
        id: pharmacyContactId,
        organizationId: patient.organizationId,
        active: true,
      },
      select: {
        name: true,
        phone: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
      },
    });
    if (!contact) {
      return { ok: false, error: "Selected pharmacy not found." };
    }
    pharmacy = {
      pharmacyName: contact.name,
      pharmacyPhone: contact.phone,
      pharmacyAddress:
        [contact.addressLine1, contact.city, contact.state, contact.postalCode]
          .filter(Boolean)
          .join(", ") || null,
    };
  }

  // requestedQty = number of doses covering the requested days supply.
  const requestedQty = Math.max(1, daysSupply * regimen.frequencyPerDay);

  const refill = await prisma.refillRequest.create({
    data: {
      organizationId: patient.organizationId,
      patientId: patient.id,
      medicationId: medication.id,
      requestedQty,
      requestedDays: daysSupply,
      ...pharmacy,
      status: "new",
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "portal.refillRequest.created",
      subjectType: "RefillRequest",
      subjectId: refill.id,
      metadata: {
        regimenId: regimen.id,
        medication: medicationName,
        daysSupply,
        pharmacyName: pharmacy.pharmacyName,
      },
    },
  });

  revalidatePath("/portal/medications");
  revalidatePath("/clinic/sign-off/refills");
  revalidatePath("/clinic/refills");

  return { ok: true, refillRequestId: refill.id };
}
