"use server";

/**
 * EMR-1131 / EMR-1135 — Ambient Optimization Canvas server actions.
 *
 * Wires the deterministic Rx safety guardrail engine
 * (src/lib/clinical/rx-safety) into the live prescribe form:
 *
 *   - evaluateDraftRxAction: assembles the PatientRxProfile from Prisma
 *     (labs by LOINC, active meds, botanical/cannabinoid exposures from the
 *     product + dosing logs, sex/age) and runs evaluateRxSafety against the
 *     drafted order. Called debounced from the form as the drug name/dose
 *     fields resolve — no rows are written.
 *
 *   - acceptRxSafetyRecommendationAction: audit trail for the one-click
 *     "apply recommendation" affordance. The draft mutation itself happens
 *     client-side (the provider still reviews + signs); this action records
 *     the acceptance in AuditLog using the same pattern as the refill
 *     sign-off actions.
 *
 * TODO(EMR-1135 follow-up): persist blocking evaluations as FHIR
 * DetectedIssue + the proposed alternative as a draft MedicationRequest
 * (Phase 5 of the red-text spec). Deferred until the FHIR resource store
 * lands; AuditLog rows carry the full finding payload meanwhile.
 */

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  ForbiddenError,
  assertChartAccess,
  hasPermission,
} from "@/lib/rbac/permissions";
import {
  evaluateRxSafety,
  type RxSafetyEvaluation,
} from "@/lib/clinical/rx-safety/evaluate";
import { buildPatientRxProfile } from "@/lib/clinical/rx-safety/profile";

// How far back the Organ Clearance Vault looks for labs. Wider than the
// 180-day freshness window on purpose: stale labs still surface as
// lowConfidence findings instead of silently disappearing.
const LAB_LOOKBACK_DAYS = 730;
// Recent dose logs window for the botanical/cannabinoid exposure manifest.
const DOSE_LOG_LOOKBACK_DAYS = 90;

const orderSchema = z.object({
  drugName: z.string().min(2).max(200),
  rxNormCui: z.string().max(20).optional(),
  dose: z.string().max(60).optional(),
  route: z.string().max(100).optional(),
  frequency: z.string().max(100).optional(),
  dailyDoseMg: z.number().positive().max(1_000_000).optional(),
});

export type EvaluateDraftRxResult =
  | { ok: true; evaluation: RxSafetyEvaluation }
  | { ok: false; error: string };

/**
 * Evaluate a drafted order against the patient's assembled Rx profile.
 * Org-scoped + permission-gated like the neighboring prescribe action:
 * requires prescriptions.write and chart access (privacy restrictions).
 */
export async function evaluateDraftRxAction(
  patientId: string,
  order: z.infer<typeof orderSchema>
): Promise<EvaluateDraftRxResult> {
  const user = await requireUser();
  if (!hasPermission(user, "prescriptions.write")) {
    return { ok: false, error: "Not permitted to draft prescriptions." };
  }

  const parsed = orderSchema.safeParse(order);
  if (!parsed.success) {
    return { ok: false, error: "Invalid draft order." };
  }

  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Chart access denied." };
    }
    throw err;
  }

  const now = new Date();
  const labSince = new Date(now.getTime() - LAB_LOOKBACK_DAYS * 86_400_000);
  const logSince = new Date(
    now.getTime() - DOSE_LOG_LOOKBACK_DAYS * 86_400_000
  );

  const productSelect = {
    name: true,
    thcConcentration: true,
    cbdConcentration: true,
    cbnConcentration: true,
    cbgConcentration: true,
  } as const;

  const [patient, labResults, medications, dosingRegimens, doseLogs] =
    await Promise.all([
      prisma.patient.findFirst({
        where: {
          id: patientId,
          organizationId: user.organizationId!,
          deletedAt: null,
        },
        select: { id: true, dateOfBirth: true, intakeAnswers: true },
      }),
      prisma.labResult.findMany({
        where: { patientId, receivedAt: { gte: labSince } },
        orderBy: { receivedAt: "desc" },
        select: { receivedAt: true, results: true },
        take: 40,
      }),
      prisma.patientMedication.findMany({
        where: { patientId, active: true },
        select: { name: true, type: true, active: true },
      }),
      prisma.dosingRegimen.findMany({
        where: { patientId, active: true },
        select: { active: true, product: { select: productSelect } },
        take: 50,
      }),
      prisma.doseLog.findMany({
        where: { patientId, loggedAt: { gte: logSince } },
        orderBy: { loggedAt: "desc" },
        select: {
          estimatedThcMg: true,
          estimatedCbdMg: true,
          regimen: { select: { product: { select: productSelect } } },
        },
        take: 100,
      }),
    ]);

  if (!patient) return { ok: false, error: "Patient not found." };

  const profile = buildPatientRxProfile(
    { patient, labResults, medications, dosingRegimens, doseLogs },
    now
  );

  const evaluation = await evaluateRxSafety(parsed.data, profile, now);
  return { ok: true, evaluation };
}

const acceptSchema = z.object({
  ruleId: z.string().min(1).max(120),
  kind: z.string().min(1).max(40),
  layer: z.string().min(1).max(40),
  recommendation: z.string().max(2000),
  adjustmentLabel: z.string().max(300),
  before: z.object({
    drugName: z.string().max(200),
    dose: z.string().max(60),
  }),
  after: z.object({
    drugName: z.string().max(200),
    dose: z.string().max(60),
  }),
  requiredFollowUp: z
    .array(z.object({ labLoinc: z.string().max(20), timing: z.string().max(100) }))
    .max(10)
    .default([]),
});

export type AcceptRxSafetyResult = { ok: true } | { ok: false; error: string };

/**
 * Record acceptance of a guardrail recommendation. The form has already
 * applied the swap/dose adjustment to the DRAFT (nothing is signed); this
 * writes the durable audit entry, same shape as refillRequest.approved.
 */
export async function acceptRxSafetyRecommendationAction(
  patientId: string,
  payload: z.infer<typeof acceptSchema>
): Promise<AcceptRxSafetyResult> {
  const user = await requireUser();
  if (!hasPermission(user, "prescriptions.write")) {
    return { ok: false, error: "Not permitted to draft prescriptions." };
  }

  const parsed = acceptSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid payload." };

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: { id: true, organizationId: true },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Chart access denied." };
    }
    throw err;
  }

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "rxSafety.recommendation.accepted",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: {
        ruleId: parsed.data.ruleId,
        kind: parsed.data.kind,
        layer: parsed.data.layer,
        recommendation: parsed.data.recommendation,
        adjustmentLabel: parsed.data.adjustmentLabel,
        before: parsed.data.before,
        after: parsed.data.after,
        requiredFollowUp: parsed.data.requiredFollowUp,
      },
    },
  });

  return { ok: true };
}
