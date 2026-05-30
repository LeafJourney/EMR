import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const prisma = {
    appointment: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn(), create: vi.fn() },
  };
  return { prisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.prisma }));
vi.mock("./previsit-readiness", () => ({
  getAppointmentReadiness: vi.fn(),
}));

import {
  sendDueVisitReminders,
  sendDuePrevisitCompletionReminders,
  pickPrevisitMilestone,
  PREVISIT_COMPLETION_REMINDER_ACTION,
} from "./send-reminders";
import { getAppointmentReadiness } from "./previsit-readiness";
import { getMockSmsAdapter } from "@/lib/sms/adapter";

const { prisma } = hoisted;
const day = 24 * 60 * 60_000;
const NOW = new Date("2026-06-01T12:00:00.000Z");
const PORTAL = "https://portal.leafjourney.com";

function makeAppt(overrides: Partial<any> = {}) {
  return {
    id: "appt_1",
    status: "confirmed",
    startAt: new Date("2026-06-08T16:00:00.000Z"), // 7 calendar days out
    modality: "video",
    patient: { id: "pat_1", firstName: "Maya", phone: "+15551234567", organizationId: "org_1" },
    provider: { title: "Dr.", user: { firstName: "Sanjay", lastName: "Patel" } },
    ...overrides,
  };
}

const incomplete = {
  readiness: { isReady: false, missingRequiredIds: ["consent", "insurance_or_attestation"], outstandingRequiredCount: 2, completionPct: 0.6 },
  patientId: "pat_1",
  organizationId: "org_1",
};
const complete = {
  readiness: { isReady: true, missingRequiredIds: [], outstandingRequiredCount: 0, completionPct: 1 },
  patientId: "pat_1",
  organizationId: "org_1",
};
const dueAppointmentReminder = () =>
  makeAppt({ id: "appt_sms", startAt: new Date("2026-06-08T12:00:00.000Z") });

beforeEach(() => {
  vi.clearAllMocks();
  getMockSmsAdapter().reset();
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  prisma.auditLog.findMany.mockResolvedValue([]);
  prisma.auditLog.create.mockResolvedValue({});
});

describe("pickPrevisitMilestone", () => {
  it("maps 7 / 2 / 0 UTC-calendar-day offsets to milestones", () => {
    expect(pickPrevisitMilestone(NOW, new Date("2026-06-08T09:00:00Z"))).toBe("7day");
    expect(pickPrevisitMilestone(NOW, new Date("2026-06-03T23:00:00Z"))).toBe("2day");
    expect(pickPrevisitMilestone(NOW, new Date("2026-06-01T18:00:00Z"))).toBe("morning_of");
  });

  it("returns null off-cadence and once the visit has started", () => {
    expect(pickPrevisitMilestone(NOW, new Date("2026-06-05T09:00:00Z"))).toBeNull();
    expect(pickPrevisitMilestone(NOW, new Date("2026-06-01T11:00:00Z"))).toBeNull();
  });
});

describe("sendDuePrevisitCompletionReminders", () => {
  it("sends a PHI-free portal CTA when due + incomplete, then audits it", async () => {
    prisma.appointment.findMany.mockResolvedValue([makeAppt()]);
    vi.mocked(getAppointmentReadiness).mockResolvedValue(incomplete as any);

    const res = await sendDuePrevisitCompletionReminders({ now: NOW, portalUrl: PORTAL });

    expect(res.sent).toBe(1);
    expect(res.details[0]).toMatchObject({ appointmentId: "appt_1", milestone: "7day", result: "sent" });

    const sent = getMockSmsAdapter().getSent();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("+15551234567");
    expect(sent[0].body).toContain(PORTAL);
    // No PHI in the body or the send context.
    expect(sent[0].body).not.toMatch(/pat_1|1985|consent|insurance/i);
    expect(JSON.stringify(sent[0].context ?? {})).not.toMatch(/1985|firstName|lastName|dateOfBirth/i);

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const data = prisma.auditLog.create.mock.calls[0][0].data;
    expect(data.action).toBe(PREVISIT_COMPLETION_REMINDER_ACTION);
    expect(data.subjectId).toBe("appt_1");
    expect(data.metadata).toMatchObject({ milestone: "7day", outstandingCount: 2 });
    // audit metadata must not carry the requirement *labels* or any PHI
    expect(JSON.stringify(data.metadata)).not.toMatch(/1985|firstName|back pain/i);
  });

  it("does NOT nudge a patient who has completed all required items", async () => {
    prisma.appointment.findMany.mockResolvedValue([makeAppt()]);
    vi.mocked(getAppointmentReadiness).mockResolvedValue(complete as any);

    const res = await sendDuePrevisitCompletionReminders({ now: NOW, portalUrl: PORTAL });

    expect(res.sent).toBe(0);
    expect(res.details[0].result).toBe("skipped:complete");
    expect(getMockSmsAdapter().getSent()).toHaveLength(0);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("skips appointments off the 7d/2d/morning-of cadence", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      makeAppt({ startAt: new Date("2026-06-05T16:00:00.000Z") }), // 4 days out
    ]);
    vi.mocked(getAppointmentReadiness).mockResolvedValue(incomplete as any);

    const res = await sendDuePrevisitCompletionReminders({ now: NOW, portalUrl: PORTAL });
    expect(res.sent).toBe(0);
    expect(res.details[0].result).toBe("skipped:out-of-window");
    // readiness shouldn't even be consulted off-cadence
    expect(getAppointmentReadiness).not.toHaveBeenCalled();
  });

  it("is idempotent — does not resend the same milestone for the same appointment", async () => {
    prisma.appointment.findMany.mockResolvedValue([makeAppt()]);
    vi.mocked(getAppointmentReadiness).mockResolvedValue(incomplete as any);
    prisma.auditLog.findMany.mockResolvedValue([{ metadata: { milestone: "7day" } }]);

    const res = await sendDuePrevisitCompletionReminders({ now: NOW, portalUrl: PORTAL });
    expect(res.sent).toBe(0);
    expect(res.details[0].result).toBe("skipped:already-sent");
    expect(getMockSmsAdapter().getSent()).toHaveLength(0);
  });

  it("skips when there is no deliverable channel (no phone on file)", async () => {
    prisma.appointment.findMany.mockResolvedValue([
      makeAppt({ patient: { id: "pat_1", phone: null, organizationId: "org_1" } }),
    ]);
    vi.mocked(getAppointmentReadiness).mockResolvedValue(incomplete as any);

    const res = await sendDuePrevisitCompletionReminders({ now: NOW, portalUrl: PORTAL });
    expect(res.sent).toBe(0);
    expect(res.details[0].result).toBe("skipped:no-channel");
  });

  it("does not write an audit row when the channel send fails", async () => {
    // An un-normalizable phone makes the SMS adapter return ok:false.
    prisma.appointment.findMany.mockResolvedValue([
      makeAppt({ patient: { id: "pat_1", phone: "123", organizationId: "org_1" } }),
    ]);
    vi.mocked(getAppointmentReadiness).mockResolvedValue(incomplete as any);

    const res = await sendDuePrevisitCompletionReminders({ now: NOW, portalUrl: PORTAL });
    // "123" fails normalizePhone -> treated as no deliverable channel.
    expect(res.sent).toBe(0);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("sendDueVisitReminders", () => {
  it("runs appointment reminders and pre-visit completion reminders in one scheduler tick", async () => {
    prisma.appointment.findMany
      .mockResolvedValueOnce([dueAppointmentReminder()])
      .mockResolvedValueOnce([makeAppt()]);
    vi.mocked(getAppointmentReadiness).mockResolvedValue(incomplete as any);

    const res = await sendDueVisitReminders({ now: NOW, portalUrl: PORTAL });

    expect(res.appointment.sent).toBe(1);
    expect(res.previsit?.sent).toBe(1);
    expect(getMockSmsAdapter().getSent()).toHaveLength(2);
  });

  it("quarantines pre-visit nudges when no portal origin is configured", async () => {
    prisma.appointment.findMany.mockResolvedValueOnce([dueAppointmentReminder()]);

    const res = await sendDueVisitReminders({ now: NOW });

    expect(res.appointment.sent).toBe(1);
    expect(res.previsit).toBeNull();
    expect(res.previsitSkippedReason).toBe("portal-url-missing");
    expect(getAppointmentReadiness).not.toHaveBeenCalled();
  });

  it("quarantines pre-visit nudges when the portal origin is not a bare HTTPS origin", async () => {
    prisma.appointment.findMany.mockResolvedValueOnce([dueAppointmentReminder()]);

    const res = await sendDueVisitReminders({
      now: NOW,
      portalUrl: "http://portal.leafjourney.com/check-in?appointment=appt_1",
    });

    expect(res.appointment.sent).toBe(1);
    expect(res.previsit).toBeNull();
    expect(res.previsitSkippedReason).toBe("portal-url-invalid");
    expect(getAppointmentReadiness).not.toHaveBeenCalled();
  });
});
