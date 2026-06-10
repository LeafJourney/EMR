import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EMR-1095/1096/1102 — state compliance form persistence.
 * - Sign/submit must enforce required-field validation server-side and
 *   return structured fieldErrors (M7).
 * - A registry result with mode "manual_stub" must never move the form to
 *   "submitted" (nothing was transmitted), but the attempt is persisted.
 */
const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: { findFirst: vi.fn() },
    stateComplianceForm: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  return {
    mockPrisma,
    requireUserMock: vi.fn(),
    submitToStateRegistryMock: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/integrations/state-registries", () => ({
  submitToStateRegistry: (...args: unknown[]) =>
    hoisted.submitToStateRegistryMock(...args),
}));

import {
  saveComplianceForm,
  signComplianceForm,
  submitComplianceForm,
} from "./actions";

const { mockPrisma, requireUserMock, submitToStateRegistryMock } = hoisted;

function clinician(over: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    email: "doc@example.com",
    firstName: "Cli",
    lastName: "Nician",
    roles: ["clinician"],
    organizationId: "org_1",
    organizationName: "Clinic",
    ...over,
  };
}

/** Every required (non-signature) field of the CA template, filled. */
function completeCaFields(over: Record<string, unknown> = {}) {
  return {
    patientName: "Pat Patient",
    patientDob: "1990-01-01",
    patientAddress: "1 Main St, Oakland, CA, 94601",
    diagnosisCode: "G89.4",
    diagnosisDescription: "Chronic pain syndrome",
    recommendationDate: "2026-06-09",
    expirationDate: "2027-06-09",
    physicianName: "Dr. Cli Nician",
    physicianLicense: "A12345",
    ...over,
  };
}

function formRow(over: Record<string, unknown> = {}) {
  return {
    id: "form_1",
    organizationId: "org_1",
    patientId: "patient_1",
    encounterId: null,
    stateCode: "CA",
    formTemplateId: "ca-rec-001",
    formName: "Physician's Recommendation",
    fields: completeCaFields(),
    status: "draft",
    signedBy: null,
    signedAt: null,
    submittedAt: null,
    createdAt: new Date("2026-06-09T10:00:00.000Z"),
    updatedAt: new Date("2026-06-09T10:00:00.000Z"),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue(clinician());
  mockPrisma.patient.findFirst.mockResolvedValue({
    id: "patient_1",
    organizationId: "org_1",
  });
  mockPrisma.stateComplianceForm.findFirst.mockResolvedValue(null);
  mockPrisma.stateComplianceForm.create.mockImplementation(
    async ({ data }: any) => ({ ...formRow(), ...data, id: "form_new" }),
  );
  mockPrisma.stateComplianceForm.update.mockImplementation(
    async ({ where, data }: any) => ({ ...formRow(), id: where.id, ...data }),
  );
  mockPrisma.auditLog.create.mockResolvedValue({});
});

describe("saveComplianceForm", () => {
  it("creates a draft and only persists template-defined keys", async () => {
    const res = await saveComplianceForm({
      patientId: "patient_1",
      stateCode: "CA",
      fields: { ...completeCaFields(), __registrySubmission: "spoofed", bogus: "x" },
    });

    expect(res.ok).toBe(true);
    const created = mockPrisma.stateComplianceForm.create.mock.calls[0][0].data;
    expect(created.status).toBe("draft");
    expect(created.fields.bogus).toBeUndefined();
    expect(created.fields.__registrySubmission).toBeUndefined();
    expect(created.fields.patientName).toBe("Pat Patient");
  });

  it("refuses to edit a signed form", async () => {
    mockPrisma.stateComplianceForm.findFirst.mockResolvedValue(
      formRow({ status: "complete", signedAt: new Date() }),
    );

    const res = await saveComplianceForm({
      patientId: "patient_1",
      stateCode: "CA",
      fields: completeCaFields(),
    });

    expect(res.ok).toBe(false);
    expect(mockPrisma.stateComplianceForm.update).not.toHaveBeenCalled();
  });

  it("rejects users without notes.edit", async () => {
    requireUserMock.mockResolvedValue(clinician({ roles: ["operator"] }));

    const res = await saveComplianceForm({
      patientId: "patient_1",
      stateCode: "CA",
      fields: completeCaFields(),
    });

    expect(res.ok).toBe(false);
    expect(mockPrisma.stateComplianceForm.create).not.toHaveBeenCalled();
  });
});

describe("signComplianceForm — M7 server-side validation", () => {
  it("returns structured fieldErrors when required fields are missing", async () => {
    mockPrisma.stateComplianceForm.findFirst.mockResolvedValue(
      formRow({ fields: completeCaFields({ diagnosisCode: "", physicianLicense: undefined }) }),
    );

    const res = await signComplianceForm("form_1");

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.fieldErrors?.diagnosisCode).toBeTruthy();
    expect(res.fieldErrors?.physicianLicense).toBeTruthy();
    expect(mockPrisma.stateComplianceForm.update).not.toHaveBeenCalled();
  });

  it("signs a complete draft: signer, server timestamp, status complete, audit log", async () => {
    mockPrisma.stateComplianceForm.findFirst.mockResolvedValue(formRow());

    const res = await signComplianceForm("form_1");

    expect(res.ok).toBe(true);
    const update = mockPrisma.stateComplianceForm.update.mock.calls[0][0];
    expect(update.data.status).toBe("complete");
    expect(update.data.signedBy).toBe("Cli Nician");
    expect(update.data.signedAt).toBeInstanceOf(Date);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "compliance.form.signed" }),
      }),
    );
  });
});

describe("submitComplianceForm — registry honesty (B3)", () => {
  function signedRow(over: Record<string, unknown> = {}) {
    return formRow({
      status: "complete",
      signedBy: "Cli Nician",
      signedAt: new Date("2026-06-09T11:00:00.000Z"),
      ...over,
    });
  }

  it("manual_stub: persists the attempt but does NOT mark the form submitted", async () => {
    mockPrisma.stateComplianceForm.findFirst.mockResolvedValue(signedRow());
    submitToStateRegistryMock.mockResolvedValue({
      success: true,
      mode: "manual_stub",
      submittedAt: "2026-06-09T12:00:00.000Z",
    });

    const res = await submitComplianceForm("form_1");

    expect(res.ok).toBe(true);
    const update = mockPrisma.stateComplianceForm.update.mock.calls[0][0];
    expect(update.data.status).toBeUndefined();
    expect(update.data.submittedAt).toBeUndefined();
    expect(update.data.fields.__registrySubmission).toMatchObject({
      mode: "manual_stub",
      success: true,
      confirmationNumber: null,
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "compliance.form.manual_submission_required",
        }),
      }),
    );
  });

  it("api success: marks submitted with the registry confirmation", async () => {
    mockPrisma.stateComplianceForm.findFirst.mockResolvedValue(signedRow());
    submitToStateRegistryMock.mockResolvedValue({
      success: true,
      mode: "api",
      confirmationNumber: "FL-REAL-123",
      submittedAt: "2026-06-09T12:00:00.000Z",
    });

    const res = await submitComplianceForm("form_1");

    expect(res.ok).toBe(true);
    const update = mockPrisma.stateComplianceForm.update.mock.calls[0][0];
    expect(update.data.status).toBe("submitted");
    expect(update.data.submittedAt).toBeInstanceOf(Date);
    expect(update.data.fields.__registrySubmission).toMatchObject({
      mode: "api",
      confirmationNumber: "FL-REAL-123",
    });
  });

  it("registry failure: persists the attempt, stays unsubmitted, returns ok:false", async () => {
    mockPrisma.stateComplianceForm.findFirst.mockResolvedValue(signedRow());
    submitToStateRegistryMock.mockResolvedValue({
      success: false,
      mode: "api",
      errors: ["Registry API error: 500"],
      submittedAt: "2026-06-09T12:00:00.000Z",
    });

    const res = await submitComplianceForm("form_1");

    expect(res.ok).toBe(false);
    const update = mockPrisma.stateComplianceForm.update.mock.calls[0][0];
    expect(update.data.status).toBeUndefined();
    expect(update.data.fields.__registrySubmission).toMatchObject({
      mode: "api",
      success: false,
    });
  });

  it("refuses to submit an unsigned form", async () => {
    mockPrisma.stateComplianceForm.findFirst.mockResolvedValue(formRow());

    const res = await submitComplianceForm("form_1");

    expect(res.ok).toBe(false);
    expect(submitToStateRegistryMock).not.toHaveBeenCalled();
  });
});
