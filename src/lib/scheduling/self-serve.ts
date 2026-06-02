/**
 * EMR-206 — Self-serve online scheduling (availability + booking policy).
 *
 * The basic slot grid lives in `@/lib/domain/scheduling` (`generateSlots`).
 * This module is the *advanced capacity* layer the AI Scheduling Engine
 * needs on top of it:
 *
 *   1. Availability generation across a date range and multiple providers
 *      that honors recurring rules, time-off/blocked exceptions, the visit
 *      type's real duration (a 60-min new-patient occupies two 30-min grid
 *      cells), and already-booked appointments.
 *   2. Double-booking detection (two patients can never grab the same slot).
 *   3. Booking-request validation (lead time, visit-type/modality offered,
 *      conflicts) with a public-vs-portal disposition (`requested` vs
 *      `confirmed`).
 *   4. Cancellation + reschedule policy (free-cancel window, fee tier,
 *      reschedule budget, reason capture).
 *
 * Everything here is pure and dependency-free (no Prisma, no schema): callers
 * pass in pre-fetched rules / appointments / exceptions and get back plain
 * data. That keeps the engine unit-testable and safe to import from any layer.
 */
import {
  APPOINTMENT_TYPE_LABELS,
  type AppointmentType,
  type AvailabilityRule,
} from "@/lib/domain/scheduling";
import type { Modality } from "./cadence-engine";

export type { AppointmentType, AvailabilityRule } from "@/lib/domain/scheduling";

/**
 * Modalities a self-serve slot can actually be booked in. `async_message`
 * (part of the broader cadence `Modality`) is a messaging touch, not a
 * calendar slot, so it's excluded from the booking surfaces here.
 */
export type BookableModality = Exclude<Modality, "async_message">;

/** Recurring weekly rules are keyed per provider for multi-provider ranges. */
type DayRule = Omit<AvailabilityRule, "providerId">;

/** Where a booking originated — maps to `Appointment.bookedVia`. */
export type BookingChannel = "public" | "portal" | "staff" | "ai";

/** A vacation / PTO / one-off blocked window for a provider. */
export interface AvailabilityException {
  providerId: string;
  start: Date;
  end: Date;
  reason?: string;
}

/**
 * An existing appointment we must not overlap. `status` is intentionally a
 * loose string so any caller's enum slots in; only `"cancelled"` frees the
 * time (a no-show still "happened" in that slot, it just won't recur).
 */
export interface BookedAppointment {
  id: string;
  providerId: string;
  start: Date;
  end: Date;
  status: string;
}

export interface ProviderAvailability {
  providerId: string;
  providerName: string;
  rules: DayRule[];
}

export interface GenerateAvailabilityInput {
  providers: ProviderAvailability[];
  /** Inclusive range start. */
  from: Date;
  /** Inclusive range end (the whole day is considered). */
  to: Date;
  visitType: AppointmentType;
  /** Optional modality filter; when omitted the rule's first modality is used. */
  modality?: BookableModality;
  existing: BookedAppointment[];
  exceptions?: AvailabilityException[];
  /** Reference "now" — slots before now (+ lead) are surfaced as unavailable. */
  now: Date;
  minLeadMinutes?: number;
  /** Grid step for candidate starts. Defaults to the rule's slot duration. */
  granularityMinutes?: number;
  /** Include unavailable slots (for a greyed-out grid) instead of dropping them. */
  includeUnavailable?: boolean;
}

export type SlotUnavailableReason = "booked" | "blocked" | "past" | "insufficient_lead";

export interface BookableSlot {
  slotId: string;
  providerId: string;
  providerName: string;
  start: Date;
  end: Date;
  visitType: AppointmentType;
  durationMinutes: number;
  modality: BookableModality;
  available: boolean;
  unavailableReason?: SlotUnavailableReason;
}

export interface BookingPolicy {
  /** Earliest you may book ahead of the start (anti-walk-in for self-serve). */
  minLeadMinutes: number;
  /** Furthest out a self-serve booking may reach. */
  maxLeadDays: number;
  /** Cancel/reschedule at or before this many hours out is free. */
  freeCancelWindowHours: number;
  /** Whether patients (non-staff channels) may reschedule themselves. */
  allowSelfReschedule: boolean;
  /** How many times a single appointment may be rescheduled. */
  maxReschedules: number;
}

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  minLeadMinutes: 120,
  maxLeadDays: 90,
  freeCancelWindowHours: 24,
  allowSelfReschedule: true,
  maxReschedules: 2,
};

/** Duration in minutes for a visit type, from the canonical label map. */
export function appointmentDurationMinutes(visitType: AppointmentType): number {
  return APPOINTMENT_TYPE_LABELS[visitType].duration;
}

/** Half-open interval overlap: [aStart,aEnd) intersects [bStart,bEnd). */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * Return the first existing appointment that collides with a proposed slot
 * for the same provider, or null if the slot is free. Cancelled appointments
 * never collide. This is the guard that prevents two patients grabbing one
 * slot — call it inside the booking transaction.
 */
export function detectDoubleBooking(
  proposed: { providerId: string; start: Date; end: Date },
  existing: BookedAppointment[],
): BookedAppointment | null {
  for (const appt of existing) {
    if (appt.providerId !== proposed.providerId) continue;
    if (appt.status === "cancelled") continue;
    if (rangesOverlap(proposed.start, proposed.end, appt.start, appt.end)) return appt;
  }
  return null;
}

function overlapsException(
  proposed: { providerId: string; start: Date; end: Date },
  exceptions: AvailabilityException[],
): boolean {
  return exceptions.some(
    (ex) =>
      ex.providerId === proposed.providerId &&
      rangesOverlap(proposed.start, proposed.end, ex.start, ex.end),
  );
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hhmm(d: Date): string {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/**
 * Generate bookable slots for a visit type across a date range and provider
 * set. Slots whose full duration doesn't fit the rule window are skipped;
 * slots blocked by an exception, an existing appointment, the past, or the
 * lead-time floor are marked unavailable (and dropped unless
 * `includeUnavailable` is set).
 */
export function generateAvailability(input: GenerateAvailabilityInput): BookableSlot[] {
  const duration = appointmentDurationMinutes(input.visitType);
  const minLead = input.minLeadMinutes ?? DEFAULT_BOOKING_POLICY.minLeadMinutes;
  const exceptions = input.exceptions ?? [];
  const slots: BookableSlot[] = [];

  const rangeEnd = startOfDay(input.to).getTime();
  for (const provider of input.providers) {
    for (
      let cursor = startOfDay(input.from);
      cursor.getTime() <= rangeEnd;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
    ) {
      const dow = cursor.getDay();
      for (const rule of provider.rules) {
        if (rule.dayOfWeek !== dow) continue;
        if (!rule.appointmentTypes.includes(input.visitType)) continue;

        const modality = input.modality ?? rule.modalities[0];
        if (input.modality && !rule.modalities.includes(input.modality)) continue;

        const granularity = input.granularityMinutes ?? rule.slotDurationMinutes;
        const windowStart = rule.startHour * 60;
        const windowEnd = rule.endHour * 60;

        for (let m = windowStart; m + duration <= windowEnd; m += granularity) {
          const start = new Date(cursor);
          start.setHours(Math.floor(m / 60), m % 60, 0, 0);
          const end = new Date(start.getTime() + duration * 60_000);
          const proposed = { providerId: provider.providerId, start, end };

          const reason = slotUnavailableReason(proposed, {
            now: input.now,
            minLead,
            existing: input.existing,
            exceptions,
          });

          if (reason && !input.includeUnavailable) continue;

          slots.push({
            slotId: `${isoDay(start)}T${hhmm(start)}|${provider.providerId}`,
            providerId: provider.providerId,
            providerName: provider.providerName,
            start,
            end,
            visitType: input.visitType,
            durationMinutes: duration,
            modality,
            available: reason === null,
            ...(reason ? { unavailableReason: reason } : {}),
          });
        }
      }
    }
  }

  return slots;
}

function slotUnavailableReason(
  proposed: { providerId: string; start: Date; end: Date },
  ctx: {
    now: Date;
    minLead: number;
    existing: BookedAppointment[];
    exceptions: AvailabilityException[];
  },
): SlotUnavailableReason | null {
  const leadMinutes = (proposed.start.getTime() - ctx.now.getTime()) / 60_000;
  if (leadMinutes <= 0) return "past";
  if (leadMinutes < ctx.minLead) return "insufficient_lead";
  if (overlapsException(proposed, ctx.exceptions)) return "blocked";
  if (detectDoubleBooking(proposed, ctx.existing)) return "booked";
  return null;
}

/**
 * Public bookings land as `requested` and need staff (or an auto-confirm
 * rule) to promote them; authenticated portal/staff/ai bookings are
 * `confirmed` immediately. Matches EMR-206's acceptance criteria.
 */
export type BookingDisposition = {
  status: "requested" | "confirmed";
  bookedVia: BookingChannel;
  requiresStaffReview: boolean;
};

export function resolveBookingDisposition(channel: BookingChannel): BookingDisposition {
  const confirmed = channel === "portal" || channel === "staff" || channel === "ai";
  return {
    status: confirmed ? "confirmed" : "requested",
    bookedVia: channel,
    requiresStaffReview: !confirmed,
  };
}

export type BookingError =
  | "in_the_past"
  | "insufficient_lead"
  | "exceeds_max_lead"
  | "wrong_day"
  | "outside_hours"
  | "visit_type_not_offered"
  | "modality_not_offered"
  | "double_booked";

export interface BookingValidationInput {
  providerId: string;
  start: Date;
  visitType: AppointmentType;
  modality: BookableModality;
  channel: BookingChannel;
  /** The recurring rule governing the slot's day (caller resolves it). */
  rule: DayRule;
  existing: BookedAppointment[];
  exceptions?: AvailabilityException[];
  now: Date;
}

export interface BookingValidation {
  ok: boolean;
  errors: BookingError[];
  disposition: BookingDisposition;
  durationMinutes: number;
  start: Date;
  end: Date;
}

/**
 * Validate a single booking request against the rule, existing calendar and
 * policy. Returns every failure (not just the first) so the UI can explain
 * exactly why a slot was rejected.
 */
export function validateBooking(
  input: BookingValidationInput,
  policy: BookingPolicy = DEFAULT_BOOKING_POLICY,
): BookingValidation {
  const duration = appointmentDurationMinutes(input.visitType);
  const start = input.start;
  const end = new Date(start.getTime() + duration * 60_000);
  const errors: BookingError[] = [];

  const leadMinutes = (start.getTime() - input.now.getTime()) / 60_000;
  if (leadMinutes <= 0) errors.push("in_the_past");
  else if (leadMinutes < policy.minLeadMinutes) errors.push("insufficient_lead");
  if (leadMinutes / 60 / 24 > policy.maxLeadDays) errors.push("exceeds_max_lead");

  if (start.getDay() !== input.rule.dayOfWeek) errors.push("wrong_day");

  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes() + (end.getDate() !== start.getDate() ? 24 * 60 : 0);
  if (startMin < input.rule.startHour * 60 || endMin > input.rule.endHour * 60) {
    errors.push("outside_hours");
  }

  if (!input.rule.appointmentTypes.includes(input.visitType)) {
    errors.push("visit_type_not_offered");
  }
  if (!input.rule.modalities.includes(input.modality)) {
    errors.push("modality_not_offered");
  }

  const proposed = { providerId: input.providerId, start, end };
  if (
    detectDoubleBooking(proposed, input.existing) ||
    overlapsException(proposed, input.exceptions ?? [])
  ) {
    errors.push("double_booked");
  }

  return {
    ok: errors.length === 0,
    errors,
    disposition: resolveBookingDisposition(input.channel),
    durationMinutes: duration,
    start,
    end,
  };
}

export interface CancellationInput {
  start: Date;
  now: Date;
  status: string;
  reason?: string;
}

export interface CancellationDecision {
  allowed: boolean;
  withinFreeWindow: boolean;
  feeApplies: boolean;
  requiresReason: boolean;
  reasonProvided: boolean;
  hoursUntilStart: number;
}

/**
 * Cancellation policy. A reason is always required (it feeds the no-show
 * model and the waitlist backfill). Cancelling inside the free window incurs
 * a late-cancel fee; cancelling a past/terminal appointment is rejected.
 */
export function evaluateCancellation(
  input: CancellationInput,
  policy: BookingPolicy = DEFAULT_BOOKING_POLICY,
): CancellationDecision {
  const hoursUntilStart = (input.start.getTime() - input.now.getTime()) / 3_600_000;
  const terminal =
    input.status === "cancelled" ||
    input.status === "completed" ||
    input.status === "no_show";
  const allowed = !terminal && hoursUntilStart > 0;
  const withinFreeWindow = hoursUntilStart >= policy.freeCancelWindowHours;
  const reasonProvided = Boolean(input.reason && input.reason.trim().length > 0);

  return {
    allowed,
    withinFreeWindow,
    feeApplies: allowed && !withinFreeWindow,
    requiresReason: true,
    reasonProvided,
    hoursUntilStart,
  };
}

export interface RescheduleInput {
  currentStart: Date;
  newStart: Date;
  now: Date;
  status: string;
  rescheduleCount: number;
  channel: BookingChannel;
  /** Optional pre-computed validation of the *new* slot. */
  newSlotValidation?: BookingValidation;
}

export type RescheduleDenialReason =
  | "appointment_terminal"
  | "already_started"
  | "reschedule_limit_reached"
  | "self_reschedule_disabled"
  | "new_slot_insufficient_lead"
  | "new_slot_invalid";

export interface RescheduleDecision {
  allowed: boolean;
  reasons: RescheduleDenialReason[];
  withinFreeWindow: boolean;
  remainingReschedules: number;
}

/**
 * Reschedule policy. Honors the reschedule budget, the self-service toggle
 * (staff can always move things), the lead-time floor on the new slot, and
 * any caller-supplied validation of the target slot.
 */
export function evaluateReschedule(
  input: RescheduleInput,
  policy: BookingPolicy = DEFAULT_BOOKING_POLICY,
): RescheduleDecision {
  const reasons: RescheduleDenialReason[] = [];

  const terminal =
    input.status === "cancelled" ||
    input.status === "completed" ||
    input.status === "no_show";
  if (terminal) reasons.push("appointment_terminal");
  if (input.currentStart.getTime() <= input.now.getTime()) reasons.push("already_started");
  if (input.rescheduleCount >= policy.maxReschedules) reasons.push("reschedule_limit_reached");
  if (input.channel !== "staff" && !policy.allowSelfReschedule) {
    reasons.push("self_reschedule_disabled");
  }

  const newLeadMinutes = (input.newStart.getTime() - input.now.getTime()) / 60_000;
  if (newLeadMinutes < policy.minLeadMinutes) reasons.push("new_slot_insufficient_lead");
  if (input.newSlotValidation && !input.newSlotValidation.ok) reasons.push("new_slot_invalid");

  const hoursUntilCurrent = (input.currentStart.getTime() - input.now.getTime()) / 3_600_000;

  return {
    allowed: reasons.length === 0,
    reasons,
    withinFreeWindow: hoursUntilCurrent >= policy.freeCancelWindowHours,
    remainingReschedules: Math.max(0, policy.maxReschedules - input.rescheduleCount),
  };
}
