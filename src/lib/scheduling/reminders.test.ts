import { describe, expect, it } from "vitest";
import {
  buildReminderPlan,
  suppressFutureReminders,
  type ChannelPrefs,
  type ReminderJob,
} from "./reminders";

const prefs = (overrides: Partial<ChannelPrefs> = {}): ChannelPrefs => ({
  smsOptIn: true,
  emailOptIn: true,
  pushOptIn: true,
  quietHours: null,
  timezone: "UTC",
  preferredChannel: "sms",
  ...overrides,
});

const START = new Date("2026-07-01T15:00:00.000Z");
const BOOKED = new Date("2026-06-01T00:00:00.000Z");

const baseInput = {
  appointmentId: "appt-1",
  patientId: "pat-1",
  startAt: START,
  bookedAt: BOOKED,
  preConfirmed: false,
};

describe("buildReminderPlan", () => {
  it("sends only the single highest-value touch for a low-risk patient", () => {
    const jobs = buildReminderPlan({ ...baseInput, riskTier: "low", prefs: prefs() });
    expect(jobs).toHaveLength(2); // 24h confirm over sms + push
    expect(jobs.every((j) => j.offsetHours === 24)).toBe(true);
    expect(new Set(jobs.map((j) => j.channel))).toEqual(new Set(["sms", "push"]));
  });

  it("adds the 48h heads-up for a medium-risk patient", () => {
    const jobs = buildReminderPlan({ ...baseInput, riskTier: "medium", prefs: prefs() });
    expect(jobs).toHaveLength(4);
    expect(new Set(jobs.map((j) => j.offsetHours))).toEqual(new Set([48, 24]));
  });

  it("honors channel opt-outs", () => {
    const jobs = buildReminderPlan({
      ...baseInput,
      riskTier: "medium",
      prefs: prefs({ emailOptIn: false }),
    });
    expect(jobs.some((j) => j.channel === "email")).toBe(false);
    expect(jobs).toHaveLength(3); // 48 sms, 24 sms, 24 push
  });

  it("escalates touches for a high-risk patient including the 72h SMS", () => {
    const jobs = buildReminderPlan({ ...baseInput, riskTier: "high", prefs: prefs() });
    expect(jobs).toHaveLength(7);
    expect(jobs.some((j) => j.offsetHours === 72 && j.channel === "sms")).toBe(true);
  });

  it("drops nag-style reminders once the patient has pre-confirmed", () => {
    const jobs = buildReminderPlan({
      ...baseInput,
      riskTier: "medium",
      prefs: prefs(),
      preConfirmed: true,
    });
    expect(jobs).toHaveLength(0);
  });

  it("never schedules a reminder before the appointment was booked", () => {
    const jobs = buildReminderPlan({
      ...baseInput,
      riskTier: "low",
      prefs: prefs(),
      // Booked less than 24h before start → the 24h reminder is in the past.
      bookedAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    expect(jobs).toHaveLength(0);
  });

  it("shifts SMS/push out of the patient's quiet hours", () => {
    const start = new Date("2026-07-01T10:00:00.000Z");
    const sendAt24 = new Date(start.getTime() - 24 * 3_600_000); // 2026-06-30T10:00Z
    const jobs = buildReminderPlan({
      ...baseInput,
      startAt: start,
      riskTier: "low",
      prefs: prefs({ quietHours: { startHour: 10, endHour: 11 }, timezone: "UTC" }),
    });
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job.sendAt.getTime()).toBe(sendAt24.getTime() + 3_600_000);
    }
  });
});

describe("suppressFutureReminders", () => {
  const mk = (overrides: Partial<ReminderJob>): ReminderJob => ({
    jobKey: "k",
    appointmentId: "appt-1",
    patientId: "pat-1",
    channel: "sms",
    sendAt: new Date("2026-06-30T15:00:00.000Z"),
    offsetHours: 24,
    template: "day_before_confirm",
    expectsResponse: true,
    ...overrides,
  });

  it("suppresses only future, non-informational reminders and tags the trigger", () => {
    const confirmedAt = new Date("2026-06-30T12:00:00.000Z");
    const result = suppressFutureReminders(
      [
        mk({ jobKey: "past", sendAt: new Date("2026-06-30T10:00:00.000Z") }),
        mk({ jobKey: "future-confirm", sendAt: new Date("2026-06-30T18:00:00.000Z") }),
        mk({
          jobKey: "future-push",
          sendAt: new Date("2026-07-01T13:00:00.000Z"),
          template: "imminent_push",
          channel: "push",
        }),
      ],
      { confirmedAt, channel: "sms" },
    );

    expect(result).toHaveLength(1);
    expect(result[0].jobKey).toBe("future-confirm");
    expect(result[0].suppressedBy).toBe("sms");
  });
});
