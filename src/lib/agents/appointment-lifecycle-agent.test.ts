import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// EMR-1115 (PJ-3 / PJ-B4) — appointmentLifecycle agent:
//   * created → Notification row (send-reminders create shape) + portal
//     Message (status "sent", clinic authorship) in the patient's thread
//   * cancelled → same pair, with the cancellation reason copied out of the
//     AuditLog when the event didn't carry one
//   * idempotent per appointment+type via its own audit trail
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    auditLog: { findMany: vi.fn(), create: vi.fn() },
    appointment: { findUnique: vi.fn() },
    notification: { create: vi.fn() },
    messageThread: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));

import {
  appointmentLifecycleAgent,
  buildLifecycleCopy,
  LIFECYCLE_NOTIFIED_ACTION,
} from "./appointment-lifecycle-agent";

const { mockPrisma } = hoisted;

const ctx = {
  jobId: "job_1",
  organizationId: "org_1",
  log: vi.fn(),
  emit: vi.fn(),
  assertCan: vi.fn(),
  model: { complete: vi.fn() },
  tools: {} as never,
  stepResults: new Map(),
} as any;

function appointmentRow(over: Record<string, unknown> = {}) {
  return {
    id: "appt_1",
    startAt: new Date("2099-03-01T17:00:00Z"),
    modality: "video",
    status: "requested",
    patient: {
      id: "patient_1",
      userId: "user_p1",
      firstName: "Maya",
      organizationId: "org_1",
      organization: { timeZone: "America/Los_Angeles" },
    },
    provider: {
      title: "Dr.",
      user: { firstName: "Lena", lastName: "Ortiz" },
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // No prior lifecycle audit rows, no prior cancellation reasons.
  mockPrisma.auditLog.findMany.mockResolvedValue([]);
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
  mockPrisma.appointment.findUnique.mockResolvedValue(appointmentRow());
  mockPrisma.notification.create.mockResolvedValue({ id: "notif_1" });
  mockPrisma.messageThread.findFirst.mockResolvedValue({ id: "thread_1" });
  mockPrisma.messageThread.create.mockResolvedValue({ id: "thread_new" });
  mockPrisma.messageThread.update.mockResolvedValue({});
  mockPrisma.message.create.mockResolvedValue({ id: "msg_1" });
});

describe("appointmentLifecycle — created", () => {
  it("creates a Notification (send-reminders shape) and a sent portal Message", async () => {
    const res = await appointmentLifecycleAgent.run(
      { appointmentId: "appt_1", type: "created", reason: null, source: "patient" },
      ctx,
    );

    expect(res).toEqual({ skipped: false, notificationId: "notif_1", messageId: "msg_1" });

    // Notification — exact create shape from send-reminders.ts:580.
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: "user_p1",
        type: "appointment_confirmed",
        priority: "normal",
        title: "Appointment confirmed",
        body: expect.stringContaining("video visit"),
        href: "/portal/appointments",
      },
      select: { id: true },
    });

    // Message — patient-visible (status sent), clinic authorship (agent
    // sender, no user), portal channel, in the existing thread.
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          threadId: "thread_1",
          status: "sent",
          channel: "portal",
          delivery: "delivered",
          senderAgent: "appointmentLifecycle:1.0.0",
          aiDrafted: false,
          body: expect.stringContaining("Dr. Lena Ortiz"),
        }),
      }),
    );
    expect(mockPrisma.messageThread.create).not.toHaveBeenCalled();
    expect(mockPrisma.messageThread.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "thread_1" } }),
    );

    // Idempotency marker audit row.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: LIFECYCLE_NOTIFIED_ACTION,
        subjectType: "Appointment",
        subjectId: "appt_1",
        metadata: expect.objectContaining({ type: "created" }),
      }),
    });
  });

  it("creates a care-team thread when the patient has none", async () => {
    mockPrisma.messageThread.findFirst.mockResolvedValue(null);

    await appointmentLifecycleAgent.run(
      { appointmentId: "appt_1", type: "created" },
      ctx,
    );

    expect(mockPrisma.messageThread.create).toHaveBeenCalledWith({
      data: { patientId: "patient_1", subject: "Care team" },
    });
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threadId: "thread_new" }),
      }),
    );
  });

  it("skips the Notification (but still sends the Message) when the patient has no portal account", async () => {
    mockPrisma.appointment.findUnique.mockResolvedValue(
      appointmentRow({
        patient: {
          id: "patient_1",
          userId: null,
          firstName: "Maya",
          organizationId: "org_1",
          organization: { timeZone: "America/Los_Angeles" },
        },
      }),
    );

    const res = await appointmentLifecycleAgent.run(
      { appointmentId: "appt_1", type: "created" },
      ctx,
    );

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).toHaveBeenCalled();
    expect(res.notificationId).toBeNull();
  });
});

describe("appointmentLifecycle — cancelled", () => {
  it("copies the cancellation reason out of the AuditLog into the patient message", async () => {
    // No event reason; the clinic cancel recorded it on its audit row.
    mockPrisma.auditLog.findMany.mockImplementation(async (args: any) => {
      if (args.where.action === "appointment.cancelled") {
        return [{ metadata: { previousStatus: "confirmed", reason: "Provider out sick" } }];
      }
      return []; // no prior lifecycle deliveries
    });

    await appointmentLifecycleAgent.run(
      { appointmentId: "appt_1", type: "cancelled", reason: null, source: "staff" },
      ctx,
    );

    const messageBody = mockPrisma.message.create.mock.calls[0][0].data.body as string;
    expect(messageBody).toContain("has been cancelled");
    expect(messageBody).toContain("Provider out sick");

    expect(mockPrisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "appointment_cancelled",
          title: "Appointment cancelled",
          body: expect.stringContaining("Provider out sick"),
        }),
      }),
    );
  });

  it("prefers a reason carried on the event itself", async () => {
    await appointmentLifecycleAgent.run(
      { appointmentId: "appt_1", type: "cancelled", reason: "Patient asked to rebook", source: "patient" },
      ctx,
    );
    const messageBody = mockPrisma.message.create.mock.calls[0][0].data.body as string;
    expect(messageBody).toContain("Patient asked to rebook");
  });

  it("still notifies without a reason", async () => {
    await appointmentLifecycleAgent.run(
      { appointmentId: "appt_1", type: "cancelled" },
      ctx,
    );
    const messageBody = mockPrisma.message.create.mock.calls[0][0].data.body as string;
    expect(messageBody).toContain("has been cancelled");
    expect(messageBody).not.toContain("Reason:");
  });
});

describe("appointmentLifecycle — idempotency", () => {
  it("skips delivery entirely when this appointment+type was already notified", async () => {
    mockPrisma.auditLog.findMany.mockImplementation(async (args: any) => {
      if (args.where.action === LIFECYCLE_NOTIFIED_ACTION) {
        return [{ metadata: { type: "created" } }];
      }
      return [];
    });

    const res = await appointmentLifecycleAgent.run(
      { appointmentId: "appt_1", type: "created" },
      ctx,
    );

    expect(res).toEqual({ skipped: true, notificationId: null, messageId: null });
    expect(mockPrisma.appointment.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("a prior 'created' delivery does NOT block the 'cancelled' notice", async () => {
    mockPrisma.auditLog.findMany.mockImplementation(async (args: any) => {
      if (args.where.action === LIFECYCLE_NOTIFIED_ACTION) {
        return [{ metadata: { type: "created" } }];
      }
      return [];
    });

    const res = await appointmentLifecycleAgent.run(
      { appointmentId: "appt_1", type: "cancelled" },
      ctx,
    );

    expect(res.skipped).toBe(false);
    expect(mockPrisma.message.create).toHaveBeenCalled();
  });
});

describe("buildLifecycleCopy", () => {
  const baseArgs = {
    patientFirstName: "Maya",
    providerName: "Dr. Lena Ortiz",
    startAt: new Date("2099-03-01T17:00:00Z"),
    modality: "in_person",
    timeZone: "America/Los_Angeles",
    reason: null,
  };

  it("renders the appointment time in the clinic's timezone", () => {
    const copy = buildLifecycleCopy({ ...baseArgs, type: "created" });
    // 17:00 UTC on 2099-03-01 is 9:00 AM in Los Angeles.
    expect(copy.messageBody).toContain("9:00 AM");
  });

  it("includes the reason line only when a reason exists", () => {
    const withReason = buildLifecycleCopy({
      ...baseArgs,
      type: "cancelled",
      reason: "Clinic closure",
    });
    expect(withReason.messageBody).toContain("Reason: Clinic closure.");

    const without = buildLifecycleCopy({ ...baseArgs, type: "cancelled" });
    expect(without.messageBody).not.toContain("Reason:");
  });
});
