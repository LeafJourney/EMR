import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EMR-1111 (FO-M4) — createPatientAction was previously ungated: any
 * authenticated user could create a patient row. It now requires
 * `patient.demographics.edit` (which front office holds by design), so
 * desk access is policy rather than a missing gate.
 */
const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    patient: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  requireUserMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));

import { createPatientAction } from "./actions";

const { mockPrisma, requireUserMock } = hoisted;

const validInput = {
  firstName: "Robin",
  lastName: "Vance",
  dateOfBirth: "1990-04-12",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  sex: "",
  race: "",
  maritalStatus: "",
  photoUrl: "",
  emergencyContacts: [
    { name: "Jamie Vance", relationship: "spouse", phone: "555-0100", email: "" },
  ],
} as Parameters<typeof createPatientAction>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.patient.create.mockResolvedValue({ id: "patient_1" });
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("createPatientAction — patient.demographics.edit gate", () => {
  it("allows front_office (the role's core grant)", async () => {
    requireUserMock.mockResolvedValue({
      id: "user_fo",
      roles: ["front_office"],
      organizationId: "org_1",
    });

    const result = await createPatientAction(validInput);
    expect(result).toEqual({ ok: true, patientId: "patient_1" });
    expect(mockPrisma.patient.create).toHaveBeenCalledTimes(1);
    // Convention: create is audited.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("allows clinicians and back_office", async () => {
    for (const role of ["clinician", "back_office", "practice_owner", "midlevel"]) {
      requireUserMock.mockResolvedValue({
        id: "user_x",
        roles: [role],
        organizationId: "org_1",
      });
      const result = await createPatientAction(validInput);
      expect(result.ok, role).toBe(true);
    }
  });

  it("rejects the patient role without touching the database", async () => {
    requireUserMock.mockResolvedValue({
      id: "user_pt",
      roles: ["patient"],
      organizationId: "org_1",
    });

    const result = await createPatientAction(validInput);
    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to create patients.",
    });
    expect(mockPrisma.patient.create).not.toHaveBeenCalled();
  });

  it("rejects kiosk and operator logins", async () => {
    for (const role of ["kiosk", "operator"]) {
      requireUserMock.mockResolvedValue({
        id: "user_x",
        roles: [role],
        organizationId: "org_1",
      });
      const result = await createPatientAction(validInput);
      expect(result.ok, role).toBe(false);
    }
    expect(mockPrisma.patient.create).not.toHaveBeenCalled();
  });
});
