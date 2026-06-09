/**
 * EMR-207 — Appointment no-show risk adapter.
 *
 * Bridges loaded Appointment rows to the pure no-show model
 * (`./no-show-model`). The model needs a feature vector; this assembles one
 * from the data the schedule surfaces actually have on hand (the patient's
 * prior appointments + the appointment's own booking/start times), filling
 * the unknown signals (distance, insurance, reminder-confirm) with neutral
 * defaults so we never *over*-flag a patient on missing data.
 *
 * Kept separate from the page so the adaptation logic is unit-testable
 * without a database.
 */
import { buildFeatures, predictNoShow, type NoShowPrediction } from "./no-show-model";

export interface PriorVisit {
  status: string;
  startAt: Date;
}

export interface AppointmentRiskInput {
  /** When the appointment is scheduled to start. */
  startAt: Date;
  /** When the appointment was booked (Appointment.createdAt). */
  bookedAt: Date;
  /** Appointment modality string ("in_person" | "video" | "phone" | ...). */
  modality: string;
  /** The patient's other appointments (any time). Priors are filtered to those before startAt. */
  priorVisits: PriorVisit[];
}

/**
 * Compute a no-show prediction for one appointment. Only the patient's
 * appointments *before* this one count as priors (a future visit can't
 * inform the risk of an earlier one). "Last contact" is proxied by the
 * most recent prior visit; brand-new patients fall back to the model's
 * new-patient defaults.
 */
export function computeAppointmentRisk(input: AppointmentRiskInput): NoShowPrediction {
  const priorsBefore = input.priorVisits.filter(
    (v) => v.startAt.getTime() < input.startAt.getTime(),
  );

  const lastContactAt =
    priorsBefore.length > 0
      ? new Date(Math.max(...priorsBefore.map((v) => v.startAt.getTime())))
      : null;

  const features = buildFeatures({
    priorVisits: priorsBefore.map((v) => ({ status: v.status })),
    bookedAt: input.bookedAt,
    startAt: input.startAt,
    // Unknown on the schedule surface — pass neutral values so missing data
    // doesn't inflate risk.
    distanceMiles: null,
    modality: input.modality,
    reminderConfirmed: null,
    lastContactAt,
    insuranceVerified: true,
  });

  return predictNoShow(features);
}
