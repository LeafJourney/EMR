// EMR-1116 (PJ-M3) — portal refill request server action.

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: { findUnique: vi.fn() },
    dosingRegimen: { findFirst: vi.fn() },
    patientMedication: { findFirst: vi.fn(), create: vi.fn() },
    refillRequest: { findFirst: vi.fn(), create: vi.fn() },
    pharmacyContact: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const mockUser = {
    id: "user_1",
    email: "patient@demo.health",
    firstName: "Maya",
    lastName: "Reyes",
    roles: ["patient"],
    organizationId: "org_1",
    organizationName: "Clinic",
  };
  return {
    mockPrisma,
    requireRoleMock: vi.fn(async () => mockUser),
    revalidatePathMock: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => hoisted.revalidatePathMock(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: () => hoisted.requireRoleMock(),
}));

import { requestRefillAction } from "./actions";

const { mockPrisma } = hoisted;

const regimen = {
  id: "regimen_1",
  patientId: "patient_1",
  volumePerDose: 0.5,
  volumeUnit: "mL",
  frequencyPerDay: 2,
  startDate: new Date("2026-01-01"),
  product: { name: "Sunset Tincture 1:1" },
};

function resetAll() {
  vi.clearAllMocks();
  mockPrisma.patient.findUnique.mockResolvedValue({
    id: "patient_1",
    organizationId: "org_1",
  });
  mockPrisma.dosingRegimen.findFirst.mockResolvedValue(regimen);
  mockPrisma.patientMedication.findFirst.mockResolvedValue(null);
  mockPrisma.patientMedication.create.mockResolvedValue({ id: "med_1" });
  mockPrisma.refillRequest.findFirst.mockResolvedValue(null);
  mockPrisma.refillRequest.create.mockResolvedValue({ id: "refill_1" });
  mockPrisma.auditLog.create.mockResolvedValue({});
}

beforeEach(resetAll);

describe("requestRefillAction", () => {
  it("creates a RefillRequest shaped for the clinic sign-off queue", async () => {
    const result = await requestRefillAction({
      regimenId: "regimen_1",
      daysSupply: 30,
    });

    expect(result).toEqual({ ok: true, refillRequestId: "refill_1" });

    // Bridged PatientMedication for the cannabis regimen
    expect(mockPrisma.patientMedication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          patientId: "patient_1",
          name: "Sunset Tincture 1:1",
          type: "cannabis",
          active: true,
        }),
      }),
    );

    // Queue shape: the sign-off page filters on
    // { organizationId, status in [new, flagged], signedAt: null }.
    expect(mockPrisma.refillRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          patientId: "patient_1",
          medicationId: "med_1",
          status: "new",
          requestedDays: 30,
          requestedQty: 60, // 30 days x 2 doses/day
          pharmacyName: "Clinic dispensary — pickup",
        }),
      }),
    );

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "portal.refillRequest.created",
          subjectType: "RefillRequest",
          subjectId: "refill_1",
          actorUserId: "user_1",
        }),
      }),
    );

    expect(hoisted.revalidatePathMock).toHaveBeenCalledWith(
      "/clinic/sign-off/refills",
    );
    expect(hoisted.revalidatePathMock).toHaveBeenCalledWith(
      "/portal/medications",
    );
  });

  it("reuses an existing bridged PatientMedication instead of creating a duplicate", async () => {
    mockPrisma.patientMedication.findFirst.mockResolvedValue({ id: "med_9" });

    const result = await requestRefillAction({
      regimenId: "regimen_1",
      daysSupply: 60,
    });

    expect(result.ok).toBe(true);
    expect(mockPrisma.patientMedication.create).not.toHaveBeenCalled();
    expect(mockPrisma.refillRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ medicationId: "med_9" }),
      }),
    );
  });

  it("blocks a duplicate request while one is still open (dedupe)", async () => {
    mockPrisma.refillRequest.findFirst.mockResolvedValue({ id: "refill_open" });

    const result = await requestRefillAction({
      regimenId: "regimen_1",
      daysSupply: 30,
    });

    expect(result).toEqual({
      ok: false,
      error: "A refill request for this medication is already pending review.",
    });
    expect(mockPrisma.refillRequest.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();

    // Dedupe must look only at OPEN queue rows.
    expect(mockPrisma.refillRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["new", "flagged"] },
          signedAt: null,
        }),
      }),
    );
  });

  it("rejects a regimen that is not the signed-in patient's", async () => {
    mockPrisma.dosingRegimen.findFirst.mockResolvedValue(null);

    const result = await requestRefillAction({
      regimenId: "regimen_other",
      daysSupply: 30,
    });

    expect(result).toEqual({ ok: false, error: "Medication not found." });
    expect(mockPrisma.refillRequest.create).not.toHaveBeenCalled();
    // Patient scoping is part of the regimen lookup itself.
    expect(mockPrisma.dosingRegimen.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: "patient_1",
          active: true,
        }),
      }),
    );
  });

  it("denormalizes a chosen org pharmacy onto the request", async () => {
    mockPrisma.pharmacyContact.findFirst.mockResolvedValue({
      name: "Green Leaf Pharmacy",
      phone: "(562) 555-0142",
      addressLine1: "1250 E Ocean Blvd",
      city: "Long Beach",
      state: "CA",
      postalCode: "90802",
    });

    const result = await requestRefillAction({
      regimenId: "regimen_1",
      daysSupply: 30,
      pharmacyContactId: "pharm_1",
    });

    expect(result.ok).toBe(true);
    expect(mockPrisma.pharmacyContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "pharm_1",
          organizationId: "org_1",
          active: true,
        }),
      }),
    );
    expect(mockPrisma.refillRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pharmacyName: "Green Leaf Pharmacy",
          pharmacyPhone: "(562) 555-0142",
          pharmacyAddress: "1250 E Ocean Blvd, Long Beach, CA, 90802",
        }),
      }),
    );
  });

  it("rejects an unknown pharmacy contact", async () => {
    mockPrisma.pharmacyContact.findFirst.mockResolvedValue(null);

    const result = await requestRefillAction({
      regimenId: "regimen_1",
      daysSupply: 30,
      pharmacyContactId: "pharm_bogus",
    });

    expect(result).toEqual({ ok: false, error: "Selected pharmacy not found." });
    expect(mockPrisma.refillRequest.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input (days supply out of range)", async () => {
    const result = await requestRefillAction({
      regimenId: "regimen_1",
      daysSupply: 365,
    });

    expect(result).toEqual({ ok: false, error: "Invalid refill request." });
    expect(mockPrisma.refillRequest.create).not.toHaveBeenCalled();
  });
});
