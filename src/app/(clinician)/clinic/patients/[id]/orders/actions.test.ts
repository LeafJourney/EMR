import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    clinicalOrder: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    document: { create: vi.fn() },
  };
  const mockUser = {
    id: "user_1",
    email: "clinician@example.com",
    firstName: "Cli",
    lastName: "Nician",
    roles: ["clinician"],
    organizationId: "org_1",
    organizationName: "Clinic",
  };

  class ForbiddenError extends Error {}

  return {
    mockPrisma,
    requireUserMock: vi.fn(async () => mockUser),
    requirePermissionMock: vi.fn(),
    assertChartAccessMock: vi.fn(async (..._args: any[]) => ({
      patientId: "patient_1",
      organizationId: "org_1",
      isRestricted: false,
      isAllowed: true,
      reason: null,
    })),
    ForbiddenError,
    storageIsConfiguredMock: vi.fn((..._args: any[]) => true),
    uploadDocumentMock: vi.fn(
      async (..._args: any[]) => "docs/org_1/patient_1/file.pdf",
    ),
    dispatchMock: vi.fn(async (..._args: any[]) => undefined),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

vi.mock("@/lib/rbac/permissions", () => ({
  requirePermission: (...args: unknown[]) =>
    hoisted.requirePermissionMock(...args),
  assertChartAccess: (...args: any[]) =>
    hoisted.assertChartAccessMock(...args),
  ForbiddenError: hoisted.ForbiddenError,
}));

vi.mock("@/lib/orchestration/dispatch", () => ({
  dispatch: (...args: any[]) => hoisted.dispatchMock(...args),
}));

vi.mock("@/lib/storage/documents", () => ({
  storageIsConfigured: () => hoisted.storageIsConfiguredMock(),
  uploadDocument: (...args: any[]) => hoisted.uploadDocumentMock(...args),
}));

import { createClinicalOrder, uploadLabOrderAttachment } from "./actions";

const { mockPrisma } = hoisted;

const validInput = {
  patientId: "patient_1",
  orderType: "lab" as const,
  orderCode: "CBC,CMP",
  orderName: "Complete Blood Count, Comprehensive Metabolic Panel",
  priority: "routine" as const,
  diagnosisCodes: ["G89.29"],
  payload: { labs: ["CBC", "CMP"], reason: "Baseline" },
};

function resetAll() {
  vi.clearAllMocks();
  mockPrisma.clinicalOrder.create.mockResolvedValue({ id: "order_1" });
  mockPrisma.auditLog.create.mockResolvedValue({});
}

describe("createClinicalOrder", () => {
  beforeEach(resetAll);

  it("persists the order as placed/simulated and returns the row id", async () => {
    const result = await createClinicalOrder(validInput);

    expect(result).toEqual({ ok: true, orderId: "order_1" });
    expect(hoisted.requirePermissionMock).toHaveBeenCalledWith(
      expect.anything(),
      "labs.sign",
    );
    expect(hoisted.assertChartAccessMock).toHaveBeenCalledWith(
      expect.anything(),
      "patient_1",
    );
    expect(mockPrisma.clinicalOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          patientId: "patient_1",
          orderType: "lab",
          status: "placed",
          transmissionMode: "simulated",
          orderedById: "user_1",
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "order.lab.placed",
          subjectId: "patient_1",
        }),
      }),
    );
  });

  it("returns an error (and writes nothing) when the caller lacks permission", async () => {
    hoisted.requirePermissionMock.mockImplementation(() => {
      throw new hoisted.ForbiddenError("FORBIDDEN");
    });

    const result = await createClinicalOrder(validInput);

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to place orders.",
    });
    expect(mockPrisma.clinicalOrder.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input before touching the database", async () => {
    const result = await createClinicalOrder({
      ...validInput,
      orderType: "telepathy" as never,
    });

    expect(result).toEqual({ ok: false, error: "Invalid order." });
    expect(mockPrisma.clinicalOrder.create).not.toHaveBeenCalled();
  });
});

describe("uploadLabOrderAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The createClinicalOrder suite leaves requirePermission throwing; reset it.
    hoisted.requirePermissionMock.mockReset();
    hoisted.storageIsConfiguredMock.mockReturnValue(true);
    hoisted.uploadDocumentMock.mockResolvedValue("docs/org_1/patient_1/file.pdf");
    hoisted.dispatchMock.mockResolvedValue(undefined);
    mockPrisma.document.create.mockResolvedValue({
      id: "doc_1",
      originalName: "prior-results.pdf",
    });
  });

  function formDataWithFile() {
    const fd = new FormData();
    fd.append("patientId", "patient_1");
    fd.append(
      "file",
      new File(["%PDF-1.4 fake"], "prior-results.pdf", {
        type: "application/pdf",
      }),
    );
    return fd;
  }

  it("persists the attachment as a chart document and returns its id", async () => {
    const result = await uploadLabOrderAttachment(formDataWithFile());

    expect(result).toEqual({
      ok: true,
      documentId: "doc_1",
      name: "prior-results.pdf",
    });
    expect(hoisted.uploadDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({ patientId: "patient_1", organizationId: "org_1" }),
    );
    expect(mockPrisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          patientId: "patient_1",
          organizationId: "org_1",
          storageKey: "docs/org_1/patient_1/file.pdf",
          tags: ["lab-order-attachment"],
        }),
      }),
    );
    expect(hoisted.dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "document.uploaded", documentId: "doc_1" }),
    );
  });

  it("is honest (no fake success) when document storage is not configured", async () => {
    hoisted.storageIsConfiguredMock.mockReturnValue(false);

    const result = await uploadLabOrderAttachment(formDataWithFile());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not configured/i);
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
    expect(hoisted.uploadDocumentMock).not.toHaveBeenCalled();
  });

  it("rejects when no file is attached", async () => {
    const fd = new FormData();
    fd.append("patientId", "patient_1");

    const result = await uploadLabOrderAttachment(fd);

    expect(result).toEqual({ ok: false, error: "No file selected." });
    expect(mockPrisma.document.create).not.toHaveBeenCalled();
  });
});
