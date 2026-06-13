import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock prisma + the orchestration dispatcher (vi.hoisted runs before the
// module-under-test imports them) — same pattern as messaging/deliver.test.ts.
const hoisted = vi.hoisted(() => {
  const prisma = {
    patient: { findUnique: vi.fn() },
    messageThread: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    message: { create: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const dispatch = vi.fn();
  return { prisma, dispatch };
});
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.prisma }));
vi.mock("@/lib/orchestration/dispatch", () => ({ dispatch: hoisted.dispatch }));

import { ingestInboundMessage } from "../ingest";
import { normalizeInboundMessage } from "../normalize";
import {
  buildSafetyAutoReplyBody,
  SAFETY_AUTO_REPLY_SENDER,
} from "../auto-reply";

const { prisma, dispatch } = hoisted;

const PATIENT = {
  id: "pat_1",
  userId: "user_1",
  organizationId: "org_1",
  phone: "(303) 555-1212",
  contraindications: [] as string[],
  pastMedicalConditions: [] as Array<{ condition: string }>,
  pastSurgeries: [] as Array<{ createdAt: Date }>,
};

function smsInput(body: string, overrides?: Partial<Parameters<typeof normalizeInboundMessage>[0]>) {
  return normalizeInboundMessage({
    patientId: PATIENT.id,
    channel: "sms",
    rawBody: body,
    senderVerified: true,
    externalId: "SM_abc123",
    receivedAt: new Date("2026-06-12T08:00:00Z"),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // No Twilio env → attemptDelivery uses the mock SMS adapter ("recorded").
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;

  prisma.patient.findUnique.mockResolvedValue(PATIENT);
  prisma.messageThread.findFirst.mockResolvedValue({ id: "thread_1" });
  prisma.messageThread.create.mockResolvedValue({ id: "thread_new" });
  prisma.messageThread.update.mockResolvedValue({});
  prisma.auditLog.create.mockImplementation(async () => ({ id: "audit_1" }));
  // findFirst serves two queries: SMS dedupe (deliveryDetail) and the
  // auto-reply guard (senderAgent). Default: neither exists.
  prisma.message.findFirst.mockResolvedValue(null);
  let n = 0;
  prisma.message.create.mockImplementation(async ({ data }: any) => ({
    id: data.senderAgent ? "msg_reply" : `msg_${++n}`,
  }));
  dispatch.mockResolvedValue(["job_1"]);
});

describe("ingestInboundMessage — quarantine (dead-letter, never dropped)", () => {
  it("unverified sender → AuditLog dead-letter row, no thread/message/dispatch", async () => {
    const result = await ingestInboundMessage(
      smsInput("who dis", { patientId: null, senderVerified: false }),
      { quarantineContext: { from: "+15550001111", matchFailure: "no_patient_match" } },
    );

    expect(result).toEqual({
      status: "quarantined",
      reason: "unverified_sender",
      auditLogId: "audit_1",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("message.inbound.quarantined");
    expect(audit.metadata.rawBody).toBe("who dis"); // recoverable, not dropped
    expect(audit.metadata.from).toBe("+15550001111");

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.messageThread.create).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("verified flag but no patient match → quarantined as unmatched_patient", async () => {
    const result = await ingestInboundMessage(
      smsInput("hello", { patientId: null, senderVerified: true }),
    );
    expect(result.status).toBe("quarantined");
    expect((result as any).reason).toBe("unmatched_patient");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("patientId that no longer resolves → quarantined as patient_not_found", async () => {
    prisma.patient.findUnique.mockResolvedValue(null);
    const result = await ingestInboundMessage(smsInput("hello"));
    expect(result.status).toBe("quarantined");
    expect((result as any).reason).toBe("patient_not_found");
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe("ingestInboundMessage — happy path (benign message)", () => {
  it("persists into the existing thread and dispatches message.received", async () => {
    const result = await ingestInboundMessage(
      smsInput("Can I reschedule my appt for next week?"),
    );

    expect(result.status).toBe("ingested");
    if (result.status !== "ingested") return;
    expect(result.threadId).toBe("thread_1");
    expect(result.route).toBe("standard");
    expect(result.autoReplyMessageId).toBeNull();

    // Exactly one message row — the inbound one. No auto-reply for benign.
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const data = prisma.message.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      threadId: "thread_1",
      senderUserId: "user_1",
      status: "sent",
      channel: "sms",
      deliveryDetail: "twilio-inbound:SM_abc123",
      body: "Can I reschedule my appt for next week?",
    });

    // Same event the portal send path dispatches.
    expect(dispatch).toHaveBeenCalledWith({
      name: "message.received",
      messageId: "msg_1",
      threadId: "thread_1",
      patientId: "pat_1",
      organizationId: "org_1",
    });

    expect(prisma.messageThread.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "thread_1" } }),
    );
  });

  it("creates a fresh thread when the patient has no unresolved thread", async () => {
    prisma.messageThread.findFirst.mockResolvedValue(null);
    const result = await ingestInboundMessage(smsInput("refill please"));
    expect(result.status).toBe("ingested");
    expect(prisma.messageThread.create).toHaveBeenCalledTimes(1);
    expect(prisma.messageThread.create.mock.calls[0][0].data.subject).toBe(
      "Text message from patient",
    );
    if (result.status === "ingested") expect(result.threadId).toBe("thread_new");
  });

  it("agent dispatch failure never blocks the patient's message (Art. VI §1)", async () => {
    dispatch.mockRejectedValue(new Error("queue down"));
    const result = await ingestInboundMessage(smsInput("just saying thanks!"));
    expect(result.status).toBe("ingested");
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });
});

describe("ingestInboundMessage — idempotency", () => {
  it("duplicate MessageSid → no second message row, no dispatch", async () => {
    prisma.message.findFirst.mockImplementation(async ({ where }: any) =>
      where.deliveryDetail ? { id: "msg_existing" } : null,
    );
    const result = await ingestInboundMessage(smsInput("hello again"));
    expect(result).toEqual({ status: "duplicate", messageId: "msg_existing" });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("ingestInboundMessage — urgent route dispatches the 911/ED auto-reply", () => {
  const URGENT_BODY = "I have crushing chest pain RIGHT NOW, please help";

  it("creates the automated safety reply in the same thread, marked as agent-sent", async () => {
    const result = await ingestInboundMessage(smsInput(URGENT_BODY));

    expect(result.status).toBe("ingested");
    if (result.status !== "ingested") return;
    expect(result.route).toBe("urgent");
    expect(result.upi).toBeGreaterThanOrEqual(0.75);
    expect(result.autoReplyMessageId).toBe("msg_reply");

    // Two message rows: the inbound message + the auto-reply.
    expect(prisma.message.create).toHaveBeenCalledTimes(2);
    const reply = prisma.message.create.mock.calls[1][0].data;
    expect(reply).toMatchObject({
      threadId: "thread_1",
      senderUserId: null,
      senderAgent: SAFETY_AUTO_REPLY_SENDER,
      status: "sent",
      channel: "sms",
      recipient: PATIENT.phone,
      body: buildSafetyAutoReplyBody(),
    });
    // Clearly marked automated + carries the 911/ED instruction.
    expect(reply.body).toMatch(/automated safety message/i);
    expect(reply.body).toMatch(/911/);
    expect(reply.body).toMatch(/emergency department/i);

    // Audit-logged, PHI-safe.
    const auditActions = prisma.auditLog.create.mock.calls.map(
      (c) => c[0].data.action,
    );
    expect(auditActions).toContain("message.safety_auto_reply.sent");
    const auditRow = prisma.auditLog.create.mock.calls.find(
      (c) => c[0].data.action === "message.safety_auto_reply.sent",
    )![0].data;
    expect(auditRow.subjectId).toBe("msg_reply");
    expect(auditRow.metadata).toMatchObject({
      threadId: "thread_1",
      patientId: "pat_1",
      channel: "sms",
      dispatchedBy: "ingest",
    });
    expect(JSON.stringify(auditRow.metadata)).not.toContain("chest pain");

    // The normal agent pipeline still fires (nurse draft + observer).
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("skips the auto-reply when one was already sent in the dedupe window", async () => {
    prisma.message.findFirst.mockImplementation(async ({ where }: any) =>
      where.senderAgent ? { id: "msg_prior_reply" } : null,
    );
    const result = await ingestInboundMessage(smsInput(URGENT_BODY));
    expect(result.status).toBe("ingested");
    if (result.status !== "ingested") return;
    expect(result.route).toBe("urgent");
    expect(result.autoReplyMessageId).toBeNull();
    expect(prisma.message.create).toHaveBeenCalledTimes(1); // inbound only
    const auditActions = prisma.auditLog.create.mock.calls.map(
      (c) => c[0].data.action,
    );
    expect(auditActions).not.toContain("message.safety_auto_reply.sent");
  });

  it("auto-reply failure is loud (audit row) but does not lose the inbound message", async () => {
    let call = 0;
    prisma.message.create.mockImplementation(async ({ data }: any) => {
      call += 1;
      if (data.senderAgent) throw new Error("db write failed");
      return { id: `msg_${call}` };
    });
    const result = await ingestInboundMessage(smsInput(URGENT_BODY));
    expect(result.status).toBe("ingested");
    if (result.status !== "ingested") return;
    expect(result.autoReplyMessageId).toBeNull();
    const auditActions = prisma.auditLog.create.mock.calls.map(
      (c) => c[0].data.action,
    );
    expect(auditActions).toContain("message.safety_auto_reply.failed");
  });

  it("negated symptoms do not trigger the auto-reply (no over-triage)", async () => {
    const result = await ingestInboundMessage(
      smsInput("Good news - no chest pain since the new dose. Can I get a refill?"),
    );
    expect(result.status).toBe("ingested");
    if (result.status !== "ingested") return;
    expect(result.route).toBe("standard");
    expect(prisma.message.create).toHaveBeenCalledTimes(1);
  });
});
