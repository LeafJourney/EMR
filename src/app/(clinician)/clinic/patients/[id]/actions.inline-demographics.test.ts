import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FO-B2 (EMR-1109) — demographics/insurance inline edits gate on
 * `patient.demographics.edit`, NOT `notes.edit`. The real RBAC matrix is
 * exercised (only prisma/auth/next are mocked) so these tests prove the
 * actual grants: front_office can edit, roles without the permission
 * (e.g. operator) cannot, clinicians keep access.
 */
const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };
  return {
    mockPrisma,
    requireUserMock: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: vi.fn() }));
vi.mock("@/lib/observability/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/messaging/deliver", () => ({ deliverMessage: vi.fn() }));

import {
  updatePatientDemographicField,
  updatePatientInsuranceField,
} from "./actions";

const { mockPrisma, requireUserMock } = hoisted;

function userWithRoles(roles: string[]) {
  return {
    id: "user_1",
    email: "staff@example.com",
    firstName: "Robin",
    lastName: "Vance",
    roles,
    organizationId: "org_1",
    organizationName: "Clinic",
  };
}

function patientRow(over: Record<string, unknown> = {}) {
  return {
    id: "patient_1",
    organizationId: "org_1",
    chartRestricted: false,
    restrictedProviderIds: [] as string[],
    chartRestrictedReason: null,
    intakeAnswers: {},
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.patient.findFirst.mockResolvedValue(patientRow());
  mockPrisma.patient.update.mockResolvedValue(patientRow());
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("updatePatientDemographicField — permission gating (FO-B2)", () => {
  it("allows front_office (holds patient.demographics.edit)", async () => {
    requireUserMock.mockResolvedValue(userWithRoles(["front_office"]));

    const result = await updatePatientDemographicField(
      "patient_1",
      "phone",
      "555-201-3344",
    );

    expect(result).toEqual({ ok: true });
    expect(mockPrisma.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "patient_1" },
        data: { phone: "555-201-3344" },
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "patient.demographics.updated",
          actorUserId: "user_1",
          subjectId: "patient_1",
        }),
      }),
    );
  });

  it("still allows clinicians (regression)", async () => {
    requireUserMock.mockResolvedValue(userWithRoles(["clinician"]));

    const result = await updatePatientDemographicField(
      "patient_1",
      "email",
      "pt@example.com",
    );

    expect(result).toEqual({ ok: true });
    expect(mockPrisma.patient.update).toHaveBeenCalled();
  });

  it("denies a role without patient.demographics.edit (operator)", async () => {
    requireUserMock.mockResolvedValue(userWithRoles(["operator"]));

    const result = await updatePatientDemographicField(
      "patient_1",
      "phone",
      "555-201-3344",
    );

    expect(result).toEqual({ ok: false, error: "Read-only access to chart" });
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("updatePatientInsuranceField — permission gating (FO-B2)", () => {
  it("allows front_office to update a member ID", async () => {
    requireUserMock.mockResolvedValue(userWithRoles(["front_office"]));

    const result = await updatePatientInsuranceField(
      "patient_1",
      "memberId",
      "ABC123456",
    );

    expect(result).toEqual({ ok: true });
    const updateArgs = mockPrisma.patient.update.mock.calls[0][0];
    expect(updateArgs.data.intakeAnswers.insurance.memberId).toBe("ABC123456");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "patient.insurance.updated" }),
      }),
    );
  });

  it("denies a role without patient.demographics.edit (kiosk)", async () => {
    requireUserMock.mockResolvedValue(userWithRoles(["kiosk"]));

    const result = await updatePatientInsuranceField(
      "patient_1",
      "memberId",
      "ABC123456",
    );

    expect(result).toEqual({ ok: false, error: "Read-only access to chart" });
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
  });
});
