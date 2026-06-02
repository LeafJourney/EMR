import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/lib/rbac/permissions";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: { findFirst: vi.fn() },
    encounter: { findFirst: vi.fn() },
    note: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    visitCompletion: { findUnique: vi.fn(), create: vi.fn() },
    task: { create: vi.fn() },
    messageThread: { findFirst: vi.fn(), create: vi.fn() },
    message: { create: vi.fn() },
    $transaction: vi.fn(async (cb) => cb(mockPrisma)),
  };
  return { mockPrisma, requireUserMock: vi.fn(), recordFeedbackMock: vi.fn() };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: vi.fn() }));
vi.mock("@/lib/orchestration/runner", () => ({ runTick: vi.fn(), runJob: vi.fn() }));
vi.mock("@/lib/orchestration/model-client", () => ({
  resolveModelClient: vi.fn(),
  isModelError: vi.fn(() => false),
}));
vi.mock("@/lib/observability/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/agents/memory/agent-feedback", () => ({
  recordFeedback: hoisted.recordFeedbackMock,
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

import { releaseVisitCompletion } from "./actions";
import type { VisitCompletionReleasePayload } from "@/lib/domain/visit-completion-selection";

const { mockPrisma, requireUserMock, recordFeedbackMock } = hoisted;

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

function patient(over: Record<string, unknown> = {}) {
  return {
    id: "patient_1",
    organizationId: "org_1",
    chartRestricted: false,
    restrictedProviderIds: [],
    chartRestrictedReason: null,
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
    startedAt: new Date("2026-05-29T15:00:00.000Z"),
    completedAt: new Date("2026-05-29T16:00:00.000Z"),
    ...over,
  };
}

function validPayload(over: Partial<VisitCompletionReleasePayload> = {}): VisitCompletionReleasePayload {
  return {
    version: "visit-completion-release/v1",
    releaseActionLabel: "Release Care Plan",
    mode: "physician_release_v1",
    status: "ready_for_physician_release",
    canRelease: true,
    summary: {
      totalCards: 4,
      includedCards: 3,
      heldOutCards: 1,
      unresolvedCards: 0,
    },
    sideEffects: {
      clinical: false,
      billing: false,
      patientCommunication: true,
      scheduling: true,
      staffAssignment: true,
      chartWrite: false,
    },
    includedSections: [
      {
        cardId: "orders",
        title: "Suggested Orders",
        status: "confirmed",
        disposition: "include",
        labels: ["Order CBC"],
        confirmationNote: "Approved CBC order",
        requiresPhysicianApproval: true,
      },
      {
        cardId: "follow_up",
        title: "Follow-Up Plan",
        status: "confirmed",
        disposition: "include",
        labels: ["Follow up in 2 weeks"],
        confirmationNote: "Book follow-up",
        requiresPhysicianApproval: true,
      },
      {
        cardId: "patient_message",
        title: "Patient Communication",
        status: "confirmed",
        disposition: "include",
        labels: ["Hello, here is your care plan."],
        confirmationNote: "Drafted patient email",
        requiresPhysicianApproval: true,
      },
    ],
    heldOutSections: [
      {
        cardId: "practice_readiness",
        title: "Practice Readiness",
        status: "deferred",
        disposition: "hold_out",
        labels: ["Prior auth"],
        requiresPhysicianApproval: true,
      },
    ],
    unresolvedSections: [],
    blockingCardIds: [],
    auditEvents: [],
    feedbackSignals: [],
    safetyCopy: "Nothing is ordered, sent, billed, scheduled, or assigned until the physician releases the care plan.",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue(clinician());
  mockPrisma.patient.findFirst.mockResolvedValue(patient());
  mockPrisma.encounter.findFirst.mockResolvedValue(encounter());
  mockPrisma.note.findUnique.mockResolvedValue(note());
  mockPrisma.visitCompletion.findUnique.mockResolvedValue(null);
  mockPrisma.visitCompletion.create.mockResolvedValue({ id: "vc_1" });
  mockPrisma.task.create.mockResolvedValue({ id: "task_1" });
  mockPrisma.messageThread.findFirst.mockResolvedValue({ id: "thread_1" });
  mockPrisma.messageThread.create.mockResolvedValue({ id: "thread_1" });
  mockPrisma.message.create.mockResolvedValue({ id: "msg_1" });
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
  recordFeedbackMock.mockResolvedValue({ id: "feedback_1" });
});

describe("releaseVisitCompletion server action", () => {
  it("successfully releases a completion payload and creates EMR side effects", async () => {
    const payload = validPayload();
    const result = await releaseVisitCompletion("note_1", payload);

    expect(result).toEqual({ ok: true });

    // 1. Verify VisitCompletion record is created
    expect(mockPrisma.visitCompletion.create).toHaveBeenCalledWith({
      data: {
        noteId: "note_1",
        organizationId: "org_1",
        patientId: "patient_1",
        releasedById: "user_1",
        payload: payload,
      },
    });

    // 2. Verify back-office task is created for orders
    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        patientId: "patient_1",
        title: "Orders: Order CBC",
        description: "Suggested orders released by physician.\n\nNote: Approved CBC order",
        status: "open",
        assigneeRole: "back_office",
      },
    });

    // 3. Verify front-office task is created for follow-up
    expect(mockPrisma.task.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        patientId: "patient_1",
        title: "Follow-Up: Follow up in 2 weeks",
        description: "Follow-up plan released by physician.\n\nNote: Book follow-up",
        status: "open",
        assigneeRole: "front_office",
      },
    });

    // 4. Verify draft patient message is created in the latest thread
    expect(mockPrisma.messageThread.findFirst).toHaveBeenCalledWith({
      where: { patientId: "patient_1" },
      orderBy: { lastMessageAt: "desc" },
    });
    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: {
        threadId: "thread_1",
        senderUserId: "user_1",
        status: "draft",
        body: "Drafted patient email",
        aiDrafted: true,
        sentAt: null,
      },
    });

    // 5. Verify audit log entry with minimized metadata (no patient PHI)
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org_1",
        actorUserId: "user_1",
        action: "visit_completion.released",
        subjectType: "VisitCompletion",
        subjectId: "note_1",
        metadata: {
          totalCards: 4,
          includedCards: 3,
          heldOutCards: 1,
          version: "visit-completion-release/v1",
        },
      },
    });
  });

  it("provisions a new message thread if the patient has no existing thread", async () => {
    mockPrisma.messageThread.findFirst.mockResolvedValue(null);

    const payload = validPayload();
    const result = await releaseVisitCompletion("note_1", payload);

    expect(result).toEqual({ ok: true });

    expect(mockPrisma.messageThread.create).toHaveBeenCalledWith({
      data: {
        patientId: "patient_1",
        subject: "Care Plan & Next Steps",
        lastMessageAt: expect.any(Date),
      },
    });
    expect(mockPrisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        threadId: "thread_1",
        status: "draft",
      }),
    });
  });

  it("fails if the user lacks notes.edit permission", async () => {
    requireUserMock.mockResolvedValue(clinician({ roles: ["front_office"] }));

    const result = await releaseVisitCompletion("note_1", validPayload());

    expect(result).toEqual({ ok: false, error: "Forbidden: read-only access to notes" });
    expect(mockPrisma.visitCompletion.create).not.toHaveBeenCalled();
  });

  it("fails if the note does not exist", async () => {
    mockPrisma.note.findUnique.mockResolvedValue(null);

    const result = await releaseVisitCompletion("note_1", validPayload());

    expect(result).toEqual({ ok: false, error: "Note not found" });
  });

  it("fails if the note is not finalized", async () => {
    mockPrisma.note.findUnique.mockResolvedValue(note({ status: "draft" }));

    const result = await releaseVisitCompletion("note_1", validPayload());

    expect(result).toEqual({ ok: false, error: "This note is not finalized and cannot be completed." });
  });

  it("fails if the patient chart is restricted and user is not allowed", async () => {
    mockPrisma.note.findUnique.mockResolvedValue(
      note({ encounter: { id: "enc_1", patientId: "restricted_patient", status: "complete" } })
    );
    mockPrisma.encounter.findFirst.mockResolvedValue(
      encounter({ patientId: "restricted_patient" })
    );

    const result = await releaseVisitCompletion("note_1", validPayload());

    expect(result).toEqual({ ok: false, error: "Forbidden: chart is restricted" });
  });

  it("fails if payload.canRelease is false", async () => {
    const payload = validPayload({ canRelease: false });
    const result = await releaseVisitCompletion("note_1", payload);

    expect(result).toEqual({ ok: false, error: "Release is blocked; unresolved sections remain." });
  });

  it("fails if a visit completion has already been released (idempotency)", async () => {
    mockPrisma.visitCompletion.findUnique.mockResolvedValue({ id: "existing_vc" });

    const result = await releaseVisitCompletion("note_1", validPayload());

    expect(result).toEqual({ ok: false, error: "Visit completion has already been released." });
    expect(mockPrisma.visitCompletion.create).not.toHaveBeenCalled();
  });

  it("handles a duplicate release race without creating downstream side effects", async () => {
    mockPrisma.visitCompletion.findUnique.mockResolvedValue(null);
    mockPrisma.visitCompletion.create.mockRejectedValue({
      code: "P2002",
      message: "Unique constraint failed on the fields: (`noteId`)",
    });

    const result = await releaseVisitCompletion("note_1", validPayload());

    expect(result).toEqual({ ok: false, error: "Visit completion has already been released." });
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("records visit-completion feedback signals after a successful release", async () => {
    const payload = validPayload({
      feedbackSignals: [
        {
          cardId: "orders",
          feedbackAction: "approved",
          meaning: "Physician kept the suggested orders.",
        },
        {
          cardId: "patient_message",
          feedbackAction: "approved_with_edits",
          meaning: "Physician edited the patient communication.",
        },
        {
          cardId: "practice_readiness",
          feedbackAction: "dismissed",
          meaning: "Physician deferred practice readiness.",
        },
      ],
    });

    const result = await releaseVisitCompletion("note_1", payload);

    expect(result).toEqual({ ok: true });
    expect(recordFeedbackMock).toHaveBeenCalledTimes(3);
    expect(recordFeedbackMock).toHaveBeenCalledWith({
      agentName: "visitCompletion",
      agentVersion: "1.0.0",
      organizationId: "org_1",
      noteId: "note_1",
      action: "approved",
      reviewerId: "user_1",
      reviewerNote: "Suggested Orders: Physician kept the suggested orders.",
      editDelta: null,
    });
    expect(recordFeedbackMock).toHaveBeenCalledWith({
      agentName: "visitCompletion",
      agentVersion: "1.0.0",
      organizationId: "org_1",
      noteId: "note_1",
      action: "approved_with_edits",
      reviewerId: "user_1",
      reviewerNote: "Patient Communication: Physician edited the patient communication.",
      editDelta: "Drafted patient email",
    });
  });

  it("does not fail the care-plan release if feedback persistence fails", async () => {
    recordFeedbackMock.mockRejectedValue(new Error("feedback store unavailable"));

    const payload = validPayload({
      feedbackSignals: [
        {
          cardId: "orders",
          feedbackAction: "approved",
          meaning: "Physician kept the suggested orders.",
        },
      ],
    });

    const result = await releaseVisitCompletion("note_1", payload);

    expect(result).toEqual({ ok: true });
    expect(mockPrisma.visitCompletion.create).toHaveBeenCalled();
  });
});
