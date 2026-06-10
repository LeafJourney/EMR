import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EMR-1111 (FO-M3) — routine-messaging allowlist.
 *
 * Front office may compose AND reply to routine patient threads (previously
 * compose was ungated while reply was clinician-only). These tests pin the
 * policy: every clinic-floor role passes, everything else (patient, kiosk,
 * operator, platform roles) is rejected before any message is delivered.
 */
const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    messageThread: { findFirst: vi.fn(), create: vi.fn() },
    patient: { findFirst: vi.fn() },
  },
  requireUserMock: vi.fn(),
  deliverMessageMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/messaging/deliver", () => ({
  deliverMessage: (...args: unknown[]) => hoisted.deliverMessageMock(...args),
}));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: vi.fn() }));
vi.mock("@/lib/observability/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/email/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/sms/adapter", () => ({ getSmsAdapter: vi.fn(), normalizePhone: vi.fn() }));

import {
  composeMessage,
  composePatientMessage,
  sendClinicReplyAction,
  sendReply,
} from "./actions";

const { mockPrisma, requireUserMock, deliverMessageMock } = hoisted;

function userWith(roles: string[]) {
  return { id: "user_1", roles, organizationId: "org_1" };
}

function replyForm() {
  const fd = new FormData();
  fd.set("threadId", "thread_1");
  fd.set("body", "We've confirmed your appointment for Friday at 10am.");
  return fd;
}

function composeForm() {
  const fd = new FormData();
  fd.set("patientId", "patient_1");
  fd.set("subject", "Appointment reminder");
  fd.set("body", "See you Friday at 10am.");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.messageThread.findFirst.mockResolvedValue({ id: "thread_1" });
  mockPrisma.messageThread.create.mockResolvedValue({ id: "thread_new" });
  mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1" });
  deliverMessageMock.mockResolvedValue(undefined);
});

describe("sendClinicReplyAction — routine-messaging allowlist", () => {
  it("allows front_office to reply (FO-M3 policy decision #1)", async () => {
    requireUserMock.mockResolvedValue(userWith(["front_office"]));
    const result = await sendClinicReplyAction(null, replyForm());
    expect(result).toEqual({ ok: true });
    expect(deliverMessageMock).toHaveBeenCalledTimes(1);
  });

  it("allows back_office and clinicians to reply", async () => {
    for (const role of ["back_office", "clinician", "midlevel", "practice_owner"]) {
      requireUserMock.mockResolvedValue(userWith([role]));
      const result = await sendClinicReplyAction(null, replyForm());
      expect(result, role).toEqual({ ok: true });
    }
  });

  it("rejects the patient role without delivering", async () => {
    requireUserMock.mockResolvedValue(userWith(["patient"]));
    const result = await sendClinicReplyAction(null, replyForm());
    expect(result.ok).toBe(false);
    expect(deliverMessageMock).not.toHaveBeenCalled();
  });

  it("rejects kiosk and operator roles", async () => {
    for (const role of ["kiosk", "operator", "super_admin"]) {
      requireUserMock.mockResolvedValue(userWith([role]));
      const result = await sendClinicReplyAction(null, replyForm());
      expect(result.ok, role).toBe(false);
    }
    expect(deliverMessageMock).not.toHaveBeenCalled();
  });
});

describe("sendReply (Smart Inbox path) — same allowlist", () => {
  it("allows front_office", async () => {
    requireUserMock.mockResolvedValue(userWith(["front_office"]));
    const result = await sendReply(null, replyForm());
    expect(result).toEqual({ ok: true });
  });

  it("rejects the patient role (was previously ungated)", async () => {
    requireUserMock.mockResolvedValue(userWith(["patient"]));
    const result = await sendReply(null, replyForm());
    expect(result.ok).toBe(false);
    expect(deliverMessageMock).not.toHaveBeenCalled();
  });
});

describe("composeMessage — explicit allowlist (was ungated)", () => {
  it("allows front_office to open a new thread", async () => {
    requireUserMock.mockResolvedValue(userWith(["front_office"]));
    const result = await composeMessage(null, composeForm());
    expect(result).toEqual({ ok: true, threadId: "thread_new" });
    expect(deliverMessageMock).toHaveBeenCalledTimes(1);
  });

  it("rejects the patient role without creating a thread", async () => {
    requireUserMock.mockResolvedValue(userWith(["patient"]));
    const result = await composeMessage(null, composeForm());
    expect(result.ok).toBe(false);
    expect(mockPrisma.messageThread.create).not.toHaveBeenCalled();
    expect(deliverMessageMock).not.toHaveBeenCalled();
  });
});

describe("composePatientMessage — docked chart composer", () => {
  it("allows front_office (no longer clinician-only)", async () => {
    requireUserMock.mockResolvedValue(userWith(["front_office"]));
    const result = await composePatientMessage(null, composeForm());
    expect(result).toEqual({ ok: true, threadId: "thread_new" });
  });

  it("rejects the patient role", async () => {
    requireUserMock.mockResolvedValue(userWith(["patient"]));
    const result = await composePatientMessage(null, composeForm());
    expect(result.ok).toBe(false);
    expect(deliverMessageMock).not.toHaveBeenCalled();
  });
});
