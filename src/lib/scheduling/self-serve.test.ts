import { describe, expect, it } from "vitest";
import {
  appointmentDurationMinutes,
  detectDoubleBooking,
  evaluateCancellation,
  evaluateReschedule,
  generateAvailability,
  rangesOverlap,
  resolveBookingDisposition,
  validateBooking,
  type AvailabilityRule,
  type BookedAppointment,
} from "./self-serve";

// A concrete weekday we anchor on. We derive dayOfWeek from .getDay() so the
// suite is stable regardless of the runner's local timezone.
const BASE = new Date(2026, 4, 18, 0, 0, 0, 0); // 2026-05-18 (local)
const DOW = BASE.getDay();

const at = (h: number, m = 0, dayOffset = 0) =>
  new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() + dayOffset, h, m, 0, 0);

const rule = (
  overrides: Partial<Omit<AvailabilityRule, "providerId">> = {},
): Omit<AvailabilityRule, "providerId"> => ({
  dayOfWeek: DOW,
  startHour: 9,
  endHour: 17,
  slotDurationMinutes: 30,
  appointmentTypes: ["new_patient", "follow_up", "telehealth"],
  modalities: ["in_person", "video"],
  ...overrides,
});

const provider = (id = "prov-a", name = "Dr. A") => ({
  providerId: id,
  providerName: name,
  rules: [rule()],
});

// "now" comfortably before BASE so lead-time never trips during availability.
const dayBefore = at(8, 0, -1);

describe("appointmentDurationMinutes", () => {
  it("maps visit types to their canonical duration", () => {
    expect(appointmentDurationMinutes("follow_up")).toBe(30);
    expect(appointmentDurationMinutes("new_patient")).toBe(60);
    expect(appointmentDurationMinutes("urgent")).toBe(15);
  });
});

describe("rangesOverlap", () => {
  it("treats intervals as half-open (adjacent does not overlap)", () => {
    expect(rangesOverlap(at(9), at(10), at(10), at(11))).toBe(false);
    expect(rangesOverlap(at(9), at(10, 30), at(10), at(11))).toBe(true);
  });
});

describe("generateAvailability", () => {
  it("fills the rule window at the slot granularity for a 30-min visit", () => {
    const slots = generateAvailability({
      providers: [provider()],
      from: BASE,
      to: BASE,
      visitType: "follow_up",
      existing: [],
      now: dayBefore,
    });
    // 9:00 → 16:30 inclusive, 30-min steps = 16 slots.
    expect(slots).toHaveLength(16);
    expect(slots.every((s) => s.available)).toBe(true);
    expect(slots[0].start.getHours()).toBe(9);
    expect(slots[0].durationMinutes).toBe(30);
  });

  it("packs a 60-min visit into the grid without overrunning the window", () => {
    const slots = generateAvailability({
      providers: [provider()],
      from: BASE,
      to: BASE,
      visitType: "new_patient",
      existing: [],
      now: dayBefore,
    });
    // last start must leave room for 60 min before 17:00 → 16:00 start.
    expect(slots).toHaveLength(15);
    const last = slots[slots.length - 1];
    expect(last.end.getHours()).toBe(17);
    expect(last.start.getHours()).toBe(16);
  });

  it("drops slots that collide with an existing appointment", () => {
    const existing: BookedAppointment[] = [
      { id: "x", providerId: "prov-a", start: at(9, 30), end: at(10), status: "confirmed" },
    ];
    const slots = generateAvailability({
      providers: [provider()],
      from: BASE,
      to: BASE,
      visitType: "follow_up",
      existing,
      now: dayBefore,
    });
    expect(slots).toHaveLength(15);
    expect(slots.find((s) => s.start.getHours() === 9 && s.start.getMinutes() === 30)).toBeUndefined();
  });

  it("surfaces unavailable slots with a reason when asked", () => {
    const existing: BookedAppointment[] = [
      { id: "x", providerId: "prov-a", start: at(9, 30), end: at(10), status: "confirmed" },
    ];
    const slots = generateAvailability({
      providers: [provider()],
      from: BASE,
      to: BASE,
      visitType: "follow_up",
      existing,
      now: dayBefore,
      includeUnavailable: true,
    });
    expect(slots).toHaveLength(16);
    const booked = slots.find((s) => s.start.getHours() === 9 && s.start.getMinutes() === 30);
    expect(booked?.available).toBe(false);
    expect(booked?.unavailableReason).toBe("booked");
  });

  it("ignores cancelled appointments when computing availability", () => {
    const existing: BookedAppointment[] = [
      { id: "x", providerId: "prov-a", start: at(9, 30), end: at(10), status: "cancelled" },
    ];
    const slots = generateAvailability({
      providers: [provider()],
      from: BASE,
      to: BASE,
      visitType: "follow_up",
      existing,
      now: dayBefore,
    });
    expect(slots).toHaveLength(16);
  });

  it("blocks slots inside a time-off exception window", () => {
    const slots = generateAvailability({
      providers: [provider()],
      from: BASE,
      to: BASE,
      visitType: "follow_up",
      existing: [],
      exceptions: [{ providerId: "prov-a", start: at(9), end: at(12), reason: "PTO" }],
      now: dayBefore,
    });
    // 9:00–12:00 blocked removes the 6 morning slots → 10 left.
    expect(slots).toHaveLength(10);
    expect(slots.every((s) => s.start.getHours() >= 12)).toBe(true);
  });

  it("filters by modality and skips rules that don't offer it", () => {
    const phone = generateAvailability({
      providers: [provider()],
      from: BASE,
      to: BASE,
      visitType: "follow_up",
      modality: "phone",
      existing: [],
      now: dayBefore,
    });
    expect(phone).toHaveLength(0);

    const video = generateAvailability({
      providers: [provider()],
      from: BASE,
      to: BASE,
      visitType: "follow_up",
      modality: "video",
      existing: [],
      now: dayBefore,
    });
    expect(video.every((s) => s.modality === "video")).toBe(true);
  });

  it("emits slots for every provider in the range", () => {
    const slots = generateAvailability({
      providers: [provider("prov-a", "Dr. A"), provider("prov-b", "Dr. B")],
      from: BASE,
      to: BASE,
      visitType: "follow_up",
      existing: [],
      now: dayBefore,
    });
    const providerIds = new Set(slots.map((s) => s.providerId));
    expect(providerIds).toEqual(new Set(["prov-a", "prov-b"]));
  });

  it("does not surface slots for days with no matching rule", () => {
    const tuesdayOnly = generateAvailability({
      providers: [provider()],
      from: at(0, 0, 1), // the day after BASE
      to: at(0, 0, 1),
      visitType: "follow_up",
      existing: [],
      now: dayBefore,
    });
    expect(tuesdayOnly).toHaveLength(0);
  });
});

describe("detectDoubleBooking", () => {
  const proposed = { providerId: "prov-a", start: at(10), end: at(10, 30) };

  it("returns the colliding appointment for the same provider", () => {
    const hit = detectDoubleBooking(proposed, [
      { id: "c", providerId: "prov-a", start: at(10, 15), end: at(10, 45), status: "confirmed" },
    ]);
    expect(hit?.id).toBe("c");
  });

  it("ignores other providers and cancelled appointments", () => {
    expect(
      detectDoubleBooking(proposed, [
        { id: "other", providerId: "prov-b", start: at(10), end: at(10, 30), status: "confirmed" },
        { id: "cx", providerId: "prov-a", start: at(10), end: at(10, 30), status: "cancelled" },
      ]),
    ).toBeNull();
  });
});

describe("resolveBookingDisposition", () => {
  it("requests for public, confirms for authenticated channels", () => {
    expect(resolveBookingDisposition("public")).toEqual({
      status: "requested",
      bookedVia: "public",
      requiresStaffReview: true,
    });
    for (const ch of ["portal", "staff", "ai"] as const) {
      expect(resolveBookingDisposition(ch).status).toBe("confirmed");
      expect(resolveBookingDisposition(ch).requiresStaffReview).toBe(false);
    }
  });
});

describe("validateBooking", () => {
  const base = {
    providerId: "prov-a",
    visitType: "follow_up" as const,
    modality: "video" as const,
    channel: "portal" as const,
    rule: rule(),
    existing: [] as BookedAppointment[],
    now: dayBefore,
  };

  it("accepts a clean portal booking and confirms it", () => {
    const result = validateBooking({ ...base, start: at(10) });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.disposition.status).toBe("confirmed");
    expect(result.end.getHours()).toBe(10);
    expect(result.end.getMinutes()).toBe(30);
  });

  it("rejects past, under-lead, and over-lead starts", () => {
    expect(validateBooking({ ...base, start: at(10), now: at(11) }).errors).toContain("in_the_past");
    expect(
      validateBooking({ ...base, start: at(10), now: at(9, 30) }).errors,
    ).toContain("insufficient_lead");
    expect(
      validateBooking({ ...base, start: at(10), now: at(8, 0, -200) }).errors,
    ).toContain("exceeds_max_lead");
  });

  it("rejects wrong day, off-hours, and un-offered type/modality", () => {
    expect(
      validateBooking({ ...base, start: at(10), rule: rule({ dayOfWeek: (DOW + 1) % 7 }) }).errors,
    ).toContain("wrong_day");
    expect(validateBooking({ ...base, start: at(8) }).errors).toContain("outside_hours");
    expect(
      validateBooking({ ...base, start: at(10), rule: rule({ appointmentTypes: ["new_patient"] }) }).errors,
    ).toContain("visit_type_not_offered");
    expect(
      validateBooking({ ...base, start: at(10), modality: "phone" }).errors,
    ).toContain("modality_not_offered");
  });

  it("rejects a slot that collides with an existing appointment", () => {
    const result = validateBooking({
      ...base,
      start: at(10),
      existing: [{ id: "z", providerId: "prov-a", start: at(10, 15), end: at(11), status: "confirmed" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("double_booked");
  });
});

describe("evaluateCancellation", () => {
  it("is free outside the window and always requires a reason", () => {
    const d = evaluateCancellation({ start: at(10, 0, 3), now: BASE, status: "confirmed", reason: "Conflict" });
    expect(d.allowed).toBe(true);
    expect(d.withinFreeWindow).toBe(true);
    expect(d.feeApplies).toBe(false);
    expect(d.requiresReason).toBe(true);
    expect(d.reasonProvided).toBe(true);
  });

  it("applies a late fee inside the free-cancel window", () => {
    const d = evaluateCancellation({ start: at(10), now: at(2), status: "confirmed" });
    expect(d.allowed).toBe(true);
    expect(d.withinFreeWindow).toBe(false);
    expect(d.feeApplies).toBe(true);
    expect(d.reasonProvided).toBe(false);
  });

  it("refuses to cancel past or already-terminal appointments", () => {
    expect(evaluateCancellation({ start: at(10), now: at(11), status: "confirmed" }).allowed).toBe(false);
    expect(evaluateCancellation({ start: at(10, 0, 3), now: BASE, status: "completed" }).allowed).toBe(false);
  });
});

describe("evaluateReschedule", () => {
  const base = {
    currentStart: at(10, 0, 3),
    newStart: at(14, 0, 5),
    now: BASE,
    status: "confirmed",
    rescheduleCount: 0,
    channel: "portal" as const,
  };

  it("allows a clean reschedule and reports the remaining budget", () => {
    const d = evaluateReschedule(base);
    expect(d.allowed).toBe(true);
    expect(d.reasons).toEqual([]);
    expect(d.remainingReschedules).toBe(2);
    expect(d.withinFreeWindow).toBe(true);
  });

  it("blocks once the reschedule limit is reached", () => {
    expect(evaluateReschedule({ ...base, rescheduleCount: 2 }).reasons).toContain(
      "reschedule_limit_reached",
    );
  });

  it("blocks patient self-reschedule when disabled but lets staff through", () => {
    const policy = { minLeadMinutes: 120, maxLeadDays: 90, freeCancelWindowHours: 24, allowSelfReschedule: false, maxReschedules: 2 };
    expect(evaluateReschedule(base, policy).reasons).toContain("self_reschedule_disabled");
    expect(evaluateReschedule({ ...base, channel: "staff" }, policy).allowed).toBe(true);
  });

  it("blocks terminal, already-started, and under-lead new slots", () => {
    expect(evaluateReschedule({ ...base, status: "cancelled" }).reasons).toContain("appointment_terminal");
    expect(evaluateReschedule({ ...base, currentStart: at(9), now: at(10) }).reasons).toContain(
      "already_started",
    );
    expect(evaluateReschedule({ ...base, newStart: at(0, 30) }).reasons).toContain(
      "new_slot_insufficient_lead",
    );
  });

  it("propagates an invalid target-slot validation", () => {
    const bad = validateBooking({
      providerId: "prov-a",
      start: at(8),
      visitType: "follow_up",
      modality: "video",
      channel: "portal",
      rule: rule(),
      existing: [],
      now: dayBefore,
    });
    expect(evaluateReschedule({ ...base, newSlotValidation: bad }).reasons).toContain("new_slot_invalid");
  });
});
