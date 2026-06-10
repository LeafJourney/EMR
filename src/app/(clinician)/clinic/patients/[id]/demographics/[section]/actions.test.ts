import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FO-B3 (EMR-1109) — saveDemographicsSection persists the detail editor
 * server-side (previously localStorage-only). The real RBAC matrix is
 * exercised; prisma/auth/next are mocked.
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
    revalidatePathMock: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: hoisted.revalidatePathMock }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));

import { saveDemographicsSection } from "./actions";

const { mockPrisma, requireUserMock, revalidatePathMock } = hoisted;

function userWithRoles(roles: string[]) {
  return {
    id: "user_fo",
    email: "frontdesk@demo.health",
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
  requireUserMock.mockResolvedValue(userWithRoles(["front_office"]));
  mockPrisma.patient.findFirst.mockResolvedValue(patientRow());
  mockPrisma.patient.update.mockResolvedValue(patientRow());
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("saveDemographicsSection — contact section", () => {
  it("front_office happy path: mirrors phone/email to Patient columns and persists the section blob", async () => {
    const result = await saveDemographicsSection(
      "patient_1",
      "contact",
      {
        phone: "555-201-3344",
        email: "pt@example.com",
        address: "12 Main St, Long Beach, CA, 90802",
        emergencyName: "Sam Vance",
      },
      [{ id: "x_1", label: "Best time to call", value: "Mornings" }],
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.savedAt).toBe("string");

    const updateArgs = mockPrisma.patient.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: "patient_1" });
    // Canonical mirrors.
    expect(updateArgs.data.phone).toBe("555-201-3344");
    expect(updateArgs.data.email).toBe("pt@example.com");
    // Section blob with the full payload, including extras.
    const blob = updateArgs.data.intakeAnswers.demographicsDetail.contact;
    expect(blob.fields).toMatchObject({
      address: "12 Main St, Long Beach, CA, 90802",
      emergencyName: "Sam Vance",
    });
    expect(blob.extras).toEqual([
      { id: "x_1", label: "Best time to call", value: "Mornings" },
    ]);
    expect(blob.savedByUserId).toBe("user_fo");

    // Audit + revalidation.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "patient.demographics.updated",
          actorUserId: "user_fo",
          subjectId: "patient_1",
          metadata: expect.objectContaining({ section: "contact" }),
        }),
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/clinic/patients/patient_1");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/clinic/patients/patient_1/demographics/contact",
    );
  });

  it("clears a mirrored column when the field is emptied", async () => {
    const result = await saveDemographicsSection("patient_1", "contact", {
      phone: "",
    });

    expect(result.ok).toBe(true);
    const updateArgs = mockPrisma.patient.update.mock.calls[0][0];
    expect(updateArgs.data.phone).toBeNull();
  });

  it("rejects an invalid email without writing", async () => {
    const result = await saveDemographicsSection("patient_1", "contact", {
      email: "not-an-email",
    });

    expect(result).toEqual({ ok: false, error: "Invalid email" });
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
  });
});

describe("saveDemographicsSection — insurance section", () => {
  it("mirrors plan/member/group into intakeAnswers.insurance (same target as the inline card)", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(
      patientRow({
        intakeAnswers: { insurance: { providerName: "Old Payer" } },
      }),
    );

    const result = await saveDemographicsSection("patient_1", "insurance", {
      planName: "Blue Shield PPO",
      memberId: "BSC998877",
      groupNumber: "GRP-42",
      coordinationOfBenefits: "Primary",
    });

    expect(result.ok).toBe(true);
    const updateArgs = mockPrisma.patient.update.mock.calls[0][0];
    const intake = updateArgs.data.intakeAnswers;
    expect(intake.insurance).toMatchObject({
      providerName: "Blue Shield PPO",
      memberId: "BSC998877",
      groupNumber: "GRP-42",
    });
    expect(intake.demographicsDetail.insurance.fields.coordinationOfBenefits).toBe(
      "Primary",
    );
  });
});

describe("saveDemographicsSection — gating and validation", () => {
  it("denies a role without patient.demographics.edit (operator)", async () => {
    requireUserMock.mockResolvedValue(userWithRoles(["operator"]));

    const result = await saveDemographicsSection("patient_1", "contact", {
      phone: "555-201-3344",
    });

    expect(result).toEqual({ ok: false, error: "Read-only access to chart" });
    expect(mockPrisma.patient.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown section", async () => {
    const result = await saveDemographicsSection("patient_1", "nope", {});

    expect(result).toEqual({ ok: false, error: "Unknown section" });
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
  });

  it("rejects fields outside the section allowlist", async () => {
    const result = await saveDemographicsSection("patient_1", "contact", {
      ssn: "123-45-6789",
    });

    expect(result.ok).toBe(false);
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
  });

  it("returns not-found for a cross-org patient", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(null);

    const result = await saveDemographicsSection("patient_foreign", "contact", {
      phone: "555-201-3344",
    });

    expect(result).toEqual({ ok: false, error: "Patient not found" });
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
  });

  it("denies when the chart is restricted and the user is not on the allowlist", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(
      patientRow({
        chartRestricted: true,
        restrictedProviderIds: ["someone_else"],
        chartRestrictedReason: "privacy",
      }),
    );

    const result = await saveDemographicsSection("patient_1", "contact", {
      phone: "555-201-3344",
    });

    expect(result).toEqual({ ok: false, error: "Chart is restricted" });
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
  });
});
