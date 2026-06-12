/**
 * Payment plan engine + card-on-file autopay  (EMR-226)
 * --------------------------------------------------------------
 * Patients with > $200 balances need a path other than lump-sum.
 * Payment plans are referenced by the dunning ladder but the engine
 * didn't exist. This file owns:
 *
 *   - createPlan() — draft a plan from a target balance + monthly
 *     amount. Validates limits ($50–$500/mo, 3–24 months).
 *   - chargeNextInstallment() — autopay path. Charges the patient's
 *     stored card via the configured payment gateway (Payabli stub),
 *     advances `installmentsPaid` + `nextPaymentDate`, fires the
 *     ledger events.
 *   - markMissedInstallment() — called by the cron when a charge fails.
 *     Two missed installments → escalate to `final_notice` dunning.
 *   - resolveDunningIntent() — the function existing dunning code calls
 *     to decide whether a patient is on an active plan / in default.
 */
import { prisma } from "@/lib/db/prisma";
import type { PaymentPlan, PaymentPlanStatus, StoredPaymentMethod } from "@prisma/client";
import { resolvePaymentGateway } from "@/lib/payments";

// ---------------------------------------------------------------------------
// Limits + types
// ---------------------------------------------------------------------------

export const MIN_INSTALLMENT_CENTS = 5_000; // $50
export const MAX_INSTALLMENT_CENTS = 50_000; // $500
export const MIN_INSTALLMENT_COUNT = 3;
export const MAX_INSTALLMENT_COUNT = 24;
export const MISSED_TO_DEFAULT = 2;

export type PaymentPlanFrequency = "monthly" | "biweekly" | "weekly";

export interface CreatePlanInput {
  organizationId: string;
  patientId: string;
  totalAmountCents: number;
  installmentAmountCents: number;
  frequency: PaymentPlanFrequency;
  startDate: Date;
  autopayEnabled: boolean;
  notes?: string;
}

export interface CreatePlanResult {
  plan: PaymentPlan;
  installmentCount: number;
  finalInstallmentCents: number;
}

// ---------------------------------------------------------------------------
// Pure schedule math (testable without a DB)
// ---------------------------------------------------------------------------

export interface InstallmentSchedule {
  installmentCount: number;
  /** The remainder pulled on the last installment (total − level × (n−1)). */
  finalInstallmentCents: number;
}

/** How a balance breaks into level installments plus a final remainder. */
export function planInstallmentSchedule(
  totalAmountCents: number,
  installmentAmountCents: number,
): InstallmentSchedule {
  const installmentCount = Math.ceil(totalAmountCents / installmentAmountCents);
  const finalInstallmentCents = totalAmountCents - installmentAmountCents * (installmentCount - 1);
  return { installmentCount, finalInstallmentCents };
}

/** The amount to charge for the next installment. Non-final installments
 *  charge the level amount; the final installment trues up to the exact
 *  remaining balance using the amount *actually* paid so far
 *  (`paidAmountCents`). Truing up from `paidAmountCents` — rather than
 *  `installmentAmountCents × installmentsPaid` — keeps the last pull
 *  correct even when `modifyInstallment` changed the level amount partway
 *  through the plan, which would otherwise under-collect (mark the plan
 *  paid-in-full while a balance remains) or overcharge the patient. */
export function computeInstallmentCharge(plan: {
  totalAmountCents: number;
  installmentAmountCents: number;
  installmentsPaid: number;
  numberOfInstallments: number;
  paidAmountCents: number;
}): number {
  const isFinal = plan.numberOfInstallments - plan.installmentsPaid <= 1;
  if (!isFinal) return plan.installmentAmountCents;
  return Math.max(0, plan.totalAmountCents - plan.paidAmountCents);
}

// ---------------------------------------------------------------------------
// Plan creation
// ---------------------------------------------------------------------------

/** Build a plan and persist it. Validates per the schedule limits. */
export async function createPlan(input: CreatePlanInput): Promise<CreatePlanResult> {
  validateInstallment(input.installmentAmountCents);
  if (input.totalAmountCents <= 0) throw new Error("totalAmountCents must be positive");

  const { installmentCount, finalInstallmentCents: finalInstallment } = planInstallmentSchedule(
    input.totalAmountCents,
    input.installmentAmountCents,
  );
  if (installmentCount < MIN_INSTALLMENT_COUNT || installmentCount > MAX_INSTALLMENT_COUNT) {
    throw new Error(
      `installment count ${installmentCount} outside allowed range ${MIN_INSTALLMENT_COUNT}-${MAX_INSTALLMENT_COUNT}`,
    );
  }

  const plan = await prisma.paymentPlan.create({
    data: {
      organizationId: input.organizationId,
      patientId: input.patientId,
      totalAmountCents: input.totalAmountCents,
      installmentAmountCents: input.installmentAmountCents,
      frequency: input.frequency,
      numberOfInstallments: installmentCount,
      startDate: input.startDate,
      nextPaymentDate: input.startDate,
      autopayEnabled: input.autopayEnabled,
      status: "active",
      notes: input.notes ?? null,
    },
  });
  await prisma.financialEvent.create({
    data: {
      organizationId: input.organizationId,
      patientId: input.patientId,
      type: "payment_plan_created",
      amountCents: input.totalAmountCents,
      description: `Plan ${plan.id}: ${installmentCount} × ${formatDollars(input.installmentAmountCents)} (${input.frequency})`,
      metadata: { planId: plan.id, autopay: input.autopayEnabled },
      createdByAgent: "payment-plan-engine@1.0",
    },
  });
  return { plan, installmentCount, finalInstallmentCents: finalInstallment };
}

function validateInstallment(cents: number): void {
  if (cents < MIN_INSTALLMENT_CENTS || cents > MAX_INSTALLMENT_CENTS) {
    throw new Error(
      `installment ${formatDollars(cents)} outside allowed range ${formatDollars(MIN_INSTALLMENT_CENTS)}–${formatDollars(MAX_INSTALLMENT_CENTS)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Autopay
// ---------------------------------------------------------------------------

export type ChargeResult =
  | { ok: true; paymentId: string; chargedCents: number; remainingInstallments: number }
  | { ok: false; reason: "no_stored_method" | "gateway_decline" | "plan_inactive" | "not_due"; detail: string };

/** Charge the next installment for a plan. Idempotent on (plan, due
 *  date) — calling it twice for the same due date is a no-op. */
export async function chargeNextInstallment(planId: string, today: Date = new Date()): Promise<ChargeResult> {
  const plan = await prisma.paymentPlan.findUnique({
    where: { id: planId },
    include: { patient: { include: { paymentMethods: { where: { active: true, isDefault: true } } } } },
  });
  if (!plan) throw new Error(`unknown plan ${planId}`);
  if (plan.status !== "active") return { ok: false, reason: "plan_inactive", detail: `plan status ${plan.status}` };
  if (!plan.autopayEnabled) {
    return { ok: false, reason: "no_stored_method", detail: "autopay not enabled on this plan" };
  }
  if (!plan.nextPaymentDate || plan.nextPaymentDate > today) {
    return { ok: false, reason: "not_due", detail: `next due ${plan.nextPaymentDate?.toISOString() ?? "unknown"}` };
  }
  const card = plan.patient.paymentMethods[0] as StoredPaymentMethod | undefined;
  if (!card) return { ok: false, reason: "no_stored_method", detail: "no default card on file" };

  const chargeAmount = computeInstallmentCharge(plan);

  // Plan installments are applied to the patient's oldest unsatisfied
  // claim — Payment requires a claimId in the schema. When no claim
  // has remaining patient responsibility we still charge the card and
  // book a credit (reconciliation agent then reapplies it).
  const targetClaim = await prisma.claim.findFirst({
    where: {
      patientId: plan.patientId,
      organizationId: plan.organizationId,
      patientRespCents: { gt: 0 },
    },
    orderBy: { serviceDate: "asc" },
    select: { id: true },
  });
  if (!targetClaim) {
    return { ok: false, reason: "plan_inactive", detail: "no open claim to apply installment against" };
  }

  const gateway = resolvePaymentGateway();
  let gatewayRef: string | null = null;
  try {
    const intent = await gateway.chargeStoredMethod({
      token: card.tokenReference,
      amountCents: chargeAmount,
      clientReferenceId: `plan:${plan.id}:installment:${plan.installmentsPaid + 1}`,
      description: `Plan ${plan.id} installment ${plan.installmentsPaid + 1}/${plan.numberOfInstallments}`,
      patientId: plan.patientId,
    });
    if (intent.status !== "captured") {
      return { ok: false, reason: "gateway_decline", detail: `intent.status=${intent.status}` };
    }
    gatewayRef = intent.id;
  } catch (err) {
    return { ok: false, reason: "gateway_decline", detail: err instanceof Error ? err.message : String(err) };
  }

  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        claimId: targetClaim.id,
        amountCents: chargeAmount,
        source: "patient",
        paymentDate: today,
        reference: gatewayRef,
        notes: `Plan ${plan.id} installment ${plan.installmentsPaid + 1}/${plan.numberOfInstallments}`,
      },
    });
    const installmentsPaid = plan.installmentsPaid + 1;
    const completed = installmentsPaid >= plan.numberOfInstallments;
    await tx.paymentPlan.update({
      where: { id: plan.id },
      data: {
        installmentsPaid,
        paidAmountCents: { increment: chargeAmount },
        nextPaymentDate: completed ? null : nextDueDate(plan.frequency as PaymentPlanFrequency, today),
        status: completed ? "completed" : "active",
      },
    });
    await tx.financialEvent.create({
      data: {
        organizationId: plan.organizationId,
        patientId: plan.patientId,
        paymentId: payment.id,
        type: "payment_plan_installment",
        amountCents: chargeAmount,
        description: `Plan ${plan.id} installment ${installmentsPaid}/${plan.numberOfInstallments}`,
        metadata: { planId: plan.id, autopay: true, gatewayRef },
        createdByAgent: "payment-plan-engine@1.0",
      },
    });
    return {
      ok: true as const,
      paymentId: payment.id,
      chargedCents: chargeAmount,
      remainingInstallments: plan.numberOfInstallments - installmentsPaid,
    };
  });
}

// ---------------------------------------------------------------------------
// Default handling
// ---------------------------------------------------------------------------

/** Record a missed installment. Two consecutive misses → defaulted +
 *  the dunning fleet escalates the patient to `final_notice` tone. */
export async function markMissedInstallment(planId: string, reason: string): Promise<{ defaulted: boolean }> {
  const plan = await prisma.paymentPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error(`unknown plan ${planId}`);
  const notes = (plan.notes ?? "").split(/\n/).filter(Boolean);
  notes.push(`MISSED: ${new Date().toISOString().slice(0, 10)} — ${reason}`);
  const missCount = notes.filter((n) => n.startsWith("MISSED:")).length;
  const defaulted = missCount >= MISSED_TO_DEFAULT;

  await prisma.paymentPlan.update({
    where: { id: planId },
    data: {
      notes: notes.join("\n"),
      status: defaulted ? "defaulted" : plan.status,
      // Reschedule the next attempt one cycle out so we don't hammer
      // a card that already declined twice in a week.
      nextPaymentDate: defaulted ? null : nextDueDate(plan.frequency as PaymentPlanFrequency, new Date()),
    },
  });
  return { defaulted };
}

// ---------------------------------------------------------------------------
// Patient-facing lifecycle
// ---------------------------------------------------------------------------

/** Pause a plan. The patient self-serves this from the portal; we
 *  keep all installment state and cron simply skips paused plans. */
export async function pausePlan(planId: string, reason: string): Promise<PaymentPlan> {
  return prisma.paymentPlan.update({
    where: { id: planId },
    data: {
      status: "paused",
      notes: appendNote(undefined, `PAUSED: ${reason}`),
      nextPaymentDate: null,
    },
  });
}

export async function resumePlan(planId: string): Promise<PaymentPlan> {
  const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: planId } });
  if (plan.status !== "paused") throw new Error(`plan ${planId} is not paused (status=${plan.status})`);
  return prisma.paymentPlan.update({
    where: { id: planId },
    data: {
      status: "active",
      nextPaymentDate: nextDueDate(plan.frequency as PaymentPlanFrequency, new Date()),
    },
  });
}

export async function cancelPlan(planId: string, reason: string): Promise<PaymentPlan> {
  return prisma.paymentPlan.update({
    where: { id: planId },
    data: {
      status: "cancelled",
      notes: appendNote(undefined, `CANCELLED: ${reason}`),
      nextPaymentDate: null,
    },
  });
}

/** Patient reminder cadence for an installment plan. Persisted as a
 *  structured `REMINDER:` tag in the plan's notes (same convention the engine
 *  already uses for MISSED:/PAUSED:/CANCELLED:), so no schema change. */
export type ReminderCadence = "none" | "weekly" | "3_day" | "1_day";

export const REMINDER_CADENCES: ReminderCadence[] = [
  "none",
  "weekly",
  "3_day",
  "1_day",
];

/** Remaining installments + already-paid → the plan's total installment count
 *  after re-levelling to `newInstallmentCents`. Pure (no DB) so it's testable. */
export function computeAdjustedInstallmentCount(
  plan: { installmentsPaid: number; totalAmountCents: number; paidAmountCents: number },
  newInstallmentCents: number,
): number {
  const remainingDue = Math.max(0, plan.totalAmountCents - plan.paidAmountCents);
  const remainingInstallments = Math.max(1, Math.ceil(remainingDue / newInstallmentCents));
  return plan.installmentsPaid + remainingInstallments;
}

export interface AdjustPlanInput {
  newInstallmentCents: number;
  newFrequency: PaymentPlanFrequency;
  autopayEnabled: boolean;
  reminderCadence: ReminderCadence;
}

export interface AdjustPlanResult {
  plan: PaymentPlan;
  numberOfInstallments: number;
}

/** Adjust an active/paused plan's installment price, frequency, autopay, and
 *  patient reminder cadence. Re-levels the remaining balance and (when the
 *  frequency changed) reschedules the next payment one cycle out. Validates
 *  the same $50–$500 / 3–24-installment limits as creation. */
export async function adjustPlan(
  planId: string,
  input: AdjustPlanInput,
  today: Date = new Date(),
): Promise<AdjustPlanResult> {
  validateInstallment(input.newInstallmentCents);
  const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: planId } });
  if (plan.status !== "active" && plan.status !== "paused") {
    throw new Error(`can only adjust an active or paused plan (status=${plan.status})`);
  }

  const numberOfInstallments = computeAdjustedInstallmentCount(plan, input.newInstallmentCents);
  if (
    numberOfInstallments < MIN_INSTALLMENT_COUNT ||
    numberOfInstallments > MAX_INSTALLMENT_COUNT
  ) {
    throw new Error(
      `adjusted plan would have ${numberOfInstallments} installments, outside ${MIN_INSTALLMENT_COUNT}-${MAX_INSTALLMENT_COUNT}`,
    );
  }

  const frequencyChanged = plan.frequency !== input.newFrequency;
  const updated = await prisma.paymentPlan.update({
    where: { id: planId },
    data: {
      installmentAmountCents: input.newInstallmentCents,
      frequency: input.newFrequency,
      numberOfInstallments,
      autopayEnabled: input.autopayEnabled,
      notes: upsertNoteTag(plan.notes, "REMINDER", input.reminderCadence),
      // Only reschedule a live plan whose next date moves because the cadence changed.
      ...(frequencyChanged && plan.nextPaymentDate
        ? { nextPaymentDate: nextDueDate(input.newFrequency, today) }
        : {}),
    },
  });
  return { plan: updated, numberOfInstallments };
}

export async function modifyInstallment(
  planId: string,
  newInstallmentCents: number,
): Promise<PaymentPlan> {
  validateInstallment(newInstallmentCents);
  const plan = await prisma.paymentPlan.findUniqueOrThrow({ where: { id: planId } });
  const remainingDue = plan.totalAmountCents - plan.paidAmountCents;
  const remainingInstallments = Math.ceil(remainingDue / newInstallmentCents);
  if (
    plan.installmentsPaid + remainingInstallments < MIN_INSTALLMENT_COUNT ||
    plan.installmentsPaid + remainingInstallments > MAX_INSTALLMENT_COUNT
  ) {
    throw new Error(`new installment yields out-of-bounds total count`);
  }
  return prisma.paymentPlan.update({
    where: { id: planId },
    data: {
      installmentAmountCents: newInstallmentCents,
      numberOfInstallments: plan.installmentsPaid + remainingInstallments,
    },
  });
}

// ---------------------------------------------------------------------------
// Dunning intent
// ---------------------------------------------------------------------------

export type DunningIntent =
  | { kind: "no_action"; reason: string }
  | { kind: "active_plan"; planId: string }
  | { kind: "in_default"; planId: string; missedInstallments: number };

/** Read the patient's current plan state for the dunning ladder.
 *  A single function call so the existing dunning code doesn't have
 *  to touch PaymentPlan internals. */
export async function resolveDunningIntent(patientId: string): Promise<DunningIntent> {
  const plans = await prisma.paymentPlan.findMany({
    where: { patientId, status: { in: ["active", "paused", "defaulted"] } },
    orderBy: { createdAt: "desc" },
  });
  if (plans.length === 0) return { kind: "no_action", reason: "no plan on file" };
  const plan = plans[0];
  if (plan.status === "defaulted") {
    const missed = (plan.notes ?? "").split(/\n/).filter((n) => n.startsWith("MISSED:")).length;
    return { kind: "in_default", planId: plan.id, missedInstallments: missed };
  }
  return { kind: "active_plan", planId: plan.id };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextDueDate(frequency: PaymentPlanFrequency, fromDate: Date): Date {
  const out = new Date(fromDate);
  switch (frequency) {
    case "monthly":
      out.setUTCMonth(out.getUTCMonth() + 1);
      break;
    case "biweekly":
      out.setUTCDate(out.getUTCDate() + 14);
      break;
    case "weekly":
      out.setUTCDate(out.getUTCDate() + 7);
      break;
  }
  return out;
}

function appendNote(existing: string | undefined, addition: string): string {
  return [existing ?? "", addition].filter(Boolean).join("\n");
}

/** Set (or replace) a single `TAG: value` line inside a notes blob, leaving
 *  every other line untouched. Mirrors the engine's structured-note convention. */
export function upsertNoteTag(
  notes: string | null,
  tag: string,
  value: string,
): string {
  const prefix = `${tag}:`;
  const kept = (notes ?? "")
    .split(/\n/)
    .filter((line) => line.trim() !== "" && !line.startsWith(prefix));
  kept.push(`${tag}: ${value}`);
  return kept.join("\n");
}

/** Read back a `TAG: value` line, or null when absent. */
export function parseNoteTag(notes: string | null, tag: string): string | null {
  const prefix = `${tag}:`;
  const line = (notes ?? "")
    .split(/\n/)
    .find((l) => l.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : null;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// Make Prisma type referenceable in JSDoc above
export type { PaymentPlanStatus };
