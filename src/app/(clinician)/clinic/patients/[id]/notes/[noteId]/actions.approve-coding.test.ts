import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/lib/rbac/permissions";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    encounter: { findFirst: vi.fn() },
    note: { findUnique: vi.fn() },
    codingSuggestion: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return { mockPrisma, requireUserMock: vi.fn(), dispatchMock: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: hoisted.dispatchMock }));
vi.mock("@/lib/orchestration/runner", () => ({ runTick: vi.fn(), runJob: vi.fn() }));
vi.mock("@/lib/orchestration/model-client", () => ({
  resolveModelClient: vi.fn(),
  isModelError: vi.fn(() => false),
}));
vi.mock("@/lib/observability/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/agents/memory/agent-feedback", () => ({
  recordFeedback: vi.fn(),
}));

// Mock assertChartAccess to allow testing chart restriction gates
vi.mock("@/lib/rbac/permissions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/rbac/permissions")>();
  return {
    ...original,
    assertChartAccess: vi.fn().mockImplementation(async (user, patientId) => {
      if (patientId === "restricted_patient") {
        throw new ForbiddenError({
          reason: "chart_restricted",
          message: "Forbidden: chart is restricted",
        });
      }
    }),
  };
});

import { approveCodingSuggestion } from "./actions";

const { mockPrisma, requireUserMock, dispatchMock } = hoisted;

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

function note(over: Record<string, unknown> = {}) {
  return {
    id: "note_1",
    encounterId: "enc_1",
    status: "finalized",
    aiDrafted: false,
    blocks: [],
    authorUserId: "user_1",
    encounter: { id: "enc_1", patientId: "patient_1", status: "complete" },
    ...over,
  };
}

function encounter(over: Record<string, unknown> = {}) {
  return {
    id: "enc_1",
    organizationId: "org_1",
    patientId: "patient_1",
    status: "complete",
    ...over,
  };
}

function suggestion(over: Record<string, unknown> = {}) {
  return {
    id: "cs_1",
    noteId: "note_1",
    icd10: [{ code: "G89.29", label: "Other chronic pain", confidence: 0.8 }],
    emLevel: "99214",
    rationale: "Chronic pain management.",
    status: "suggested",
    ...over,
  };
}

const approvalInput = {
  icd10: [{ code: "G89.29", label: "Other chronic pain" }],
  emLevel: "99214",
  modified: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue(clinician());
  mockPrisma.note.findUnique.mockResolvedValue(note());
  mockPrisma.encounter.findFirst.mockResolvedValue(encounter());
  mockPrisma.codingSuggestion.findUnique.mockResolvedValue(suggestion());
  mockPrisma.codingSuggestion.update.mockResolvedValue({ id: "cs_1" });
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
  dispatchMock.mockResolvedValue([]);
});

describe("approveCodingSuggestion server action", () => {
  it("records the approval, audits it, and emits coding.approved", async () => {
    const result = await approveCodingSuggestion("note_1", approvalInput);

    expect(result).toMatchObject({
      ok: true,
      status: "approved",
      approvedByName: "Cli Nician",
    });

    expect(mockPrisma.codingSuggestion.update).toHaveBeenCalledWith({
      where: { noteId: "note_1" },
      data: expect.objectContaining({
        status: "approved",
        approvedById: "user_1",
        approvedByName: "Cli Nician",
        approvedAt: expect.any(Date),
        approvedIcd10: [{ code: "G89.29", label: "Other chronic pain" }],
        approvedEmLevel: "99214",
      }),
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "coding.approved",
        subjectType: "CodingSuggestion",
        subjectId: "cs_1",
        metadata: expect.objectContaining({
          noteId: "note_1",
          status: "approved",
          modified: false,
          codeCount: 1,
          emLevel: "99214",
        }),
      }),
    });

    expect(dispatchMock).toHaveBeenCalledWith({
      name: "coding.approved",
      noteId: "note_1",
      encounterId: "enc_1",
      patientId: "patient_1",
      organizationId: "org_1",
      approvedBy: "user_1",
      approvedIcd10: ["G89.29"],
      approvedEmLevel: "99214",
    });
  });

  it("records a modified approval when the physician edited the codes", async () => {
    const result = await approveCodingSuggestion("note_1", {
      icd10: [{ code: "G89.4", label: "Chronic pain syndrome" }],
      emLevel: "99215",
      modified: true,
    });

    expect(result).toMatchObject({ ok: true, status: "modified" });
    expect(mockPrisma.codingSuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "modified",
          approvedEmLevel: "99215",
        }),
      }),
    );
  });

  it("is idempotent — a re-approval updates the same decision row", async () => {
    mockPrisma.codingSuggestion.findUnique.mockResolvedValue(
      suggestion({ status: "approved", approvedById: "user_1" }),
    );

    const result = await approveCodingSuggestion("note_1", approvalInput);

    expect(result).toMatchObject({ ok: true, status: "approved" });
    // Always an update keyed by noteId — never a second decision record.
    expect(mockPrisma.codingSuggestion.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({ reapproval: true }),
      }),
    });
  });

  it("fails if the user lacks notes.edit permission", async () => {
    requireUserMock.mockResolvedValue(clinician({ roles: ["front_office"] }));

    const result = await approveCodingSuggestion("note_1", approvalInput);

    expect(result).toEqual({ ok: false, error: "Forbidden: read-only access to notes" });
    expect(mockPrisma.codingSuggestion.update).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("fails if the chart is restricted", async () => {
    mockPrisma.note.findUnique.mockResolvedValue(
      note({ encounter: { id: "enc_1", patientId: "restricted_patient", status: "complete" } }),
    );
    mockPrisma.encounter.findFirst.mockResolvedValue(
      encounter({ patientId: "restricted_patient" }),
    );

    const result = await approveCodingSuggestion("note_1", approvalInput);

    expect(result).toEqual({ ok: false, error: "Forbidden: chart is restricted" });
    expect(mockPrisma.codingSuggestion.update).not.toHaveBeenCalled();
  });

  it("fails if the note is not signed", async () => {
    mockPrisma.note.findUnique.mockResolvedValue(note({ status: "draft" }));

    const result = await approveCodingSuggestion("note_1", approvalInput);

    expect(result).toEqual({ ok: false, error: "Coding can only be approved on a signed note." });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("fails if no coding suggestion exists for the note", async () => {
    mockPrisma.codingSuggestion.findUnique.mockResolvedValue(null);

    const result = await approveCodingSuggestion("note_1", approvalInput);

    expect(result).toEqual({ ok: false, error: "No coding suggestion exists for this note yet." });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty approval (no codes and no E/M level)", async () => {
    const result = await approveCodingSuggestion("note_1", {
      icd10: [],
      emLevel: null,
      modified: true,
    });

    expect(result).toEqual({
      ok: false,
      error: "Approve at least one ICD-10 code or an E/M level.",
    });
    expect(mockPrisma.codingSuggestion.update).not.toHaveBeenCalled();
  });
});
