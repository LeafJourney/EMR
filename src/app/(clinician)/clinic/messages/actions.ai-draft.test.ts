import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WS-B Task 5 (EMR-1103 audit #14) — the Messaging Assistant agent was dead
 * code because `message.draft.requested` was never emitted. requestAiDraftAction
 * is the real surface that emits it. These tests pin the wiring: the correct
 * event is dispatched (org-scoped, with the thread's patient + intent), and the
 * standing workflow table routes that event to the messagingAssistant agent.
 */
const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    messageThread: { findFirst: vi.fn() },
    agentJob: { findMany: vi.fn() },
  },
  requireUserMock: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: hoisted.dispatchMock }));
vi.mock("@/lib/observability/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
// Deliver/email/sms are imported by the module but unused on this path.
vi.mock("@/lib/messaging/deliver", () => ({ deliverMessage: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/sms/adapter", () => ({ getSmsAdapter: vi.fn(), normalizePhone: vi.fn() }));

import { requestAiDraftAction } from "./actions";
import { matchWorkflows } from "@/lib/orchestration/workflows";

const { mockPrisma, requireUserMock, dispatchMock } = hoisted;

function clinician(over: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    roles: ["clinician"],
    organizationId: "org_1",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue(clinician());
  mockPrisma.messageThread.findFirst.mockResolvedValue({ patient: { id: "patient_9" } });
  mockPrisma.agentJob.findMany.mockResolvedValue([]); // no inline run
  dispatchMock.mockResolvedValue([]); // no enqueued jobs to run inline
});

describe("requestAiDraftAction", () => {
  it("dispatches message.draft.requested for the thread's patient, org-scoped", async () => {
    const result = await requestAiDraftAction("thread_1");

    expect(result).toEqual({ ok: true });
    expect(dispatchMock).toHaveBeenCalledWith({
      name: "message.draft.requested",
      patientId: "patient_9",
      intent: "follow_up",
      organizationId: "org_1",
    });
  });

  it("forwards a caller-chosen intent", async () => {
    await requestAiDraftAction("thread_1", "appointment_confirm");
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ intent: "appointment_confirm" }),
    );
  });

  it("rejects non-clinician roles without dispatching", async () => {
    requireUserMock.mockResolvedValue(clinician({ roles: ["front_office"] }));
    const result = await requestAiDraftAction("thread_1");
    expect(result.ok).toBe(false);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("rejects a thread outside the caller's org without dispatching", async () => {
    mockPrisma.messageThread.findFirst.mockResolvedValue(null);
    const result = await requestAiDraftAction("thread_1");
    expect(result).toEqual({ ok: false, error: "Thread not found." });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("the workflow table routes message.draft.requested to messagingAssistant", () => {
    const matches = matchWorkflows({
      name: "message.draft.requested",
      patientId: "patient_9",
      intent: "follow_up",
      organizationId: "org_1",
    });
    expect(matches.map((m) => m.step.agent)).toContain("messagingAssistant");
  });
});
