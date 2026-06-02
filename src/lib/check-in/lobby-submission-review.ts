// SAFE: dead-export-allowed reason="EMR-915 staff review mapping; the clinic review actions/page consume it in the same PR"
// EMR-915 — staff review of staged kiosk-lobby submissions.
//
// A KioskLobbySubmission is patient-entered data parked in a review queue; it is
// NEVER trusted as chart data until a staff member accepts it. These pure
// validators re-parse the staged JSON payload into the exact shape we'll write
// to the chart (patient intake fields, or a SignedConsent row) — defense in
// depth: even though the lobby actions validated on the way in, we never write a
// raw staged blob to the record on the way out.

import { z } from "zod";

export const intakePayloadSchema = z.object({
  presentingConcerns: z.string().max(2000).nullable().optional(),
  treatmentGoals: z.string().max(2000).nullable().optional(),
  cannabisHistory: z
    .object({
      priorUse: z.boolean().optional(),
      formats: z.array(z.string()).optional(),
      reportedBenefits: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
});

export type IntakePayload = z.infer<typeof intakePayloadSchema>;

export const consentPayloadSchema = z.object({
  templateId: z.string().min(1).max(120),
  templateName: z.string().min(1).max(200),
  version: z.string().min(1).max(40),
  responses: z.record(z.union([z.string(), z.boolean()])),
  signatureData: z.string().max(200_000).nullable().optional(),
});

export type ConsentPayload = z.infer<typeof consentPayloadSchema>;

/** Parse a staged intake payload, or null if it doesn't validate. */
export function parseIntakePayload(payload: unknown): IntakePayload | null {
  const r = intakePayloadSchema.safeParse(payload);
  return r.success ? r.data : null;
}

/** Parse a staged consent payload, or null if it doesn't validate. */
export function parseConsentPayload(payload: unknown): ConsentPayload | null {
  const r = consentPayloadSchema.safeParse(payload);
  return r.success ? r.data : null;
}

/**
 * Does a staged intake carry any substantive content? An intake where every
 * field is blank satisfies no readiness requirement yet still lands in the staff
 * queue as a meaningless review item — and tells the patient they "completed" a
 * task that did nothing. The lobby action rejects an empty intake before staging
 * using this predicate. Mirrors the consent flow, which already gates on
 * completeness.
 */
export function intakeHasContent(p: IntakePayload): boolean {
  if (p.presentingConcerns?.trim()) return true;
  if (p.treatmentGoals?.trim()) return true;
  const h = p.cannabisHistory;
  if (h) {
    if (h.priorUse) return true;
    if ((h.formats?.length ?? 0) > 0) return true;
    if ((h.reportedBenefits?.length ?? 0) > 0) return true;
  }
  return false;
}

/** The Patient fields an accepted intake submission writes (chart-bound shape). */
export function patientUpdateFromIntake(p: IntakePayload): {
  presentingConcerns?: string;
  treatmentGoals?: string;
  cannabisHistory?: { priorUse: boolean; formats: string[]; reportedBenefits: string[] };
} {
  const update: ReturnType<typeof patientUpdateFromIntake> = {};
  if (p.presentingConcerns) update.presentingConcerns = p.presentingConcerns;
  if (p.treatmentGoals) update.treatmentGoals = p.treatmentGoals;
  if (p.cannabisHistory) {
    update.cannabisHistory = {
      priorUse: p.cannabisHistory.priorUse ?? false,
      formats: p.cannabisHistory.formats ?? [],
      reportedBenefits: p.cannabisHistory.reportedBenefits ?? [],
    };
  }
  return update;
}
