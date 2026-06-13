"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { resolvePaymentGateway } from "@/lib/payments";
import { adjustPlan, createPlan, REMINDER_CADENCES } from "@/lib/billing/payment-plans";
import { deliverMessage } from "@/lib/messaging/deliver";
import {
  buildStatementNotice,
  buildTaxSummaryNotice,
} from "@/lib/messaging/statement-notice";
import { logger } from "@/lib/observability/log";

// ---------------------------------------------------------------------------
// Collect payment — records a patient payment against open balance
// ---------------------------------------------------------------------------

const collectSchema = z.object({
  patientId: z.string().min(1),
  amountCents: z.coerce.number().int().min(1).max(500000), // max $5000 per txn
  method: z.enum(["card", "ach", "cash", "check"]),
  reference: z.string().optional(),
  claimId: z.string().optional(),
  notes: z.string().optional(),
  storedMethodToken: z.string().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export type CollectResult =
  | { ok: true; paymentId: string; gatewayIntentId?: string }
  | { ok: false; error: string };

export async function collectPayment(
  _prev: CollectResult | null,
  formData: FormData,
): Promise<CollectResult> {
  const user = await requireUser();

  // Front desk and billers collect money at the desk (Back-Office Audit §7),
  // alongside operators, owners, and clinicians.
  if (
    !user.roles.some(
      (r) =>
        r === "front_office" ||
        r === "back_office" ||
        r === "operator" ||
        r === "practice_owner" ||
        r === "practice_admin" ||
        r === "clinician",
    )
  ) {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = collectSchema.safeParse({
    patientId: formData.get("patientId"),
    amountCents: formData.get("amountCents"),
    method: formData.get("method"),
    reference: formData.get("reference") || undefined,
    claimId: formData.get("claimId") || undefined,
    notes: formData.get("notes") || undefined,
    storedMethodToken: formData.get("storedMethodToken") || undefined,
    idempotencyKey: formData.get("idempotencyKey") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: "Invalid payment data" };
  }

  // ── Verify patient belongs to caller's org (and isn't soft-deleted) ──
  const patient = await prisma.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  // ── Idempotency check ────────────────────────────────────────────────
  // Prefer the client-supplied idempotencyKey (same form re-submit = same
  // key). Fall back to a server-generated cryptographically strong nonce
  // so every fresh call still gets a unique reference.
  // NOTE (follow-up): add a DB-level unique constraint on
  // Payment.reference once the migration window is available so this
  // check is enforced at the storage layer too.
  const clientReferenceId = parsed.data.idempotencyKey ?? `pmt_${randomUUID()}`;

  const existing = await prisma.payment.findFirst({
    where: { reference: clientReferenceId },
    select: { id: true },
  });
  if (existing) {
    return { ok: true, paymentId: existing.id };
  }

  // Find the claim to apply payment to — use oldest unpaid claim if not specified
  let targetClaimId = parsed.data.claimId;
  if (!targetClaimId) {
    const oldestUnpaid = await prisma.claim.findFirst({
      where: {
        patientId: parsed.data.patientId,
        patientRespCents: { gt: 0 },
        status: { in: ["accepted", "adjudicated", "partial", "paid"] },
      },
      orderBy: { serviceDate: "asc" },
    });
    targetClaimId = oldestUnpaid?.id;
  }

  if (!targetClaimId) {
    return { ok: false, error: "No open balance to apply payment to" };
  }

  // ── Route through the payment gateway ────────────────────────
  const gateway = resolvePaymentGateway();

  let gatewayIntentId: string | undefined;
  let gatewayLast4: string | undefined;
  let gatewayBrand: string | undefined;

  try {
    let intent;

    if (parsed.data.storedMethodToken) {
      // Card on file flow
      intent = await gateway.chargeStoredMethod({
        token: parsed.data.storedMethodToken,
        amountCents: parsed.data.amountCents,
        clientReferenceId,
        description: `Payment for patient ${patient.firstName} ${patient.lastName}`,
        patientId: patient.id,
      });
    } else {
      // New payment intent (card/ACH/cash/check)
      intent = await gateway.createPaymentIntent({
        amountCents: parsed.data.amountCents,
        method: parsed.data.method,
        clientReferenceId,
        description: `Payment for patient ${patient.firstName} ${patient.lastName}`,
        patientId: patient.id,
        metadata: {
          claimId: targetClaimId,
          collectedByUserId: user.id,
        },
      });
    }

    if (intent.status === "failed") {
      return {
        ok: false,
        error: intent.errorMessage ?? "Payment declined by processor",
      };
    }

    gatewayIntentId = intent.id;
    gatewayLast4 = intent.last4;
    gatewayBrand = intent.brand;
  } catch (err) {
    logger.error({ event: "clinic.billing.gateway_failed", err });
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Payment gateway error: ${err.message}`
          : "Payment gateway error",
    };
  }

  // ── Persist to ledger ─────────────────────────────────────────
  try {
    // Store the idempotency key as Payment.reference so a retry with the
    // same key hits the early-exit path above.
    const payment = await prisma.payment.create({
      data: {
        claimId: targetClaimId,
        source: "patient",
        amountCents: parsed.data.amountCents,
        reference: clientReferenceId,
        notes: parsed.data.notes ?? null,
      },
    });

    await prisma.financialEvent.create({
      data: {
        organizationId: user.organizationId!,
        patientId: parsed.data.patientId,
        claimId: targetClaimId,
        paymentId: payment.id,
        type: "patient_payment",
        amountCents: parsed.data.amountCents,
        description: `Patient payment ${(parsed.data.amountCents / 100).toFixed(2)} via ${parsed.data.method}${gatewayBrand && gatewayLast4 ? ` (${gatewayBrand} •${gatewayLast4})` : ""}`,
        metadata: {
          method: parsed.data.method,
          reference: parsed.data.reference,
          gateway: gateway.name,
          gatewayIntentId,
          last4: gatewayLast4,
          brand: gatewayBrand,
          clientReferenceId,
        },
        createdByUserId: user.id,
      },
    });

    await prisma.claim.update({
      where: { id: targetClaimId },
      data: {
        paidAmountCents: { increment: parsed.data.amountCents },
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: "patient.payment.collected",
        subjectType: "Patient",
        subjectId: patient.id,
        metadata: {
          paymentId: payment.id,
          claimId: targetClaimId,
          amountCents: parsed.data.amountCents,
          method: parsed.data.method,
          gateway: gateway.name,
          gatewayIntentId: gatewayIntentId ?? null,
          paymentReference: clientReferenceId,
        },
      },
    });

    revalidatePath(`/clinic/patients/${parsed.data.patientId}`);
    revalidatePath(`/ops/billing`);
    return { ok: true, paymentId: payment.id, gatewayIntentId };
  } catch (err) {
    logger.error({ event: "clinic.billing.persist_failed", err });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Payment persistence failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Record copay collection at check-in
// ---------------------------------------------------------------------------

const copaySchema = z.object({
  patientId: z.string().min(1),
  amountCents: z.coerce.number().int().min(1).max(500000), // max $5000 per copay txn
  method: z.enum(["card", "cash", "ach", "check"]),
});

export async function collectCopay(
  patientId: string,
  amountCents: number,
  method: "card" | "cash" | "check" | "ach",
): Promise<CollectResult> {
  const user = await requireUser();

  // ── Validate inputs ──────────────────────────────────────────────────
  const parsed = copaySchema.safeParse({ patientId, amountCents, method });
  if (!parsed.success) {
    return { ok: false, error: "Invalid copay data" };
  }

  // ── Verify patient belongs to caller's org ───────────────────────────
  const patient = await prisma.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!patient) {
    return { ok: false, error: "Patient not found." };
  }

  const paymentReference = `copay_${randomUUID()}`;

  try {
    // Create two events: assessed + collected — both attributed to the
    // acting user so we can audit every money-affecting row.
    await prisma.financialEvent.createMany({
      data: [
        {
          organizationId: user.organizationId!,
          patientId: patient.id,
          type: "copay_assessed",
          amountCents: parsed.data.amountCents,
          description: "Copay assessed at check-in",
          metadata: { paymentReference },
          createdByUserId: user.id,
        },
        {
          organizationId: user.organizationId!,
          patientId: patient.id,
          type: "copay_collected",
          amountCents: parsed.data.amountCents,
          description: `Copay collected (${parsed.data.method})`,
          metadata: { method: parsed.data.method, paymentReference },
          createdByUserId: user.id,
        },
      ],
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: "patient.copay.collected",
        subjectType: "Patient",
        subjectId: patient.id,
        metadata: {
          amountCents: parsed.data.amountCents,
          method: parsed.data.method,
          paymentReference,
        },
      },
    });

    revalidatePath(`/clinic/patients/${patient.id}`);
    return { ok: true, paymentId: paymentReference };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Copay collection failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Set up a payment plan (EMR-909)
// Wraps the payment-plan engine (createPlan) with auth + org scoping so the
// "Enroll in payment plan" dialog can stand a balance up into installments.
// The engine validates the $50–$500 / 3–24-installment limits and throws on
// violation — we surface that message back to the dialog.
// ---------------------------------------------------------------------------

const planSchema = z.object({
  patientId: z.string().min(1),
  totalAmountCents: z.coerce.number().int().min(1).max(1_000_000), // max $10k plan
  installmentAmountCents: z.coerce.number().int().min(1),
  frequency: z.enum(["monthly", "biweekly", "weekly"]),
  startDate: z.string().min(1),
  autopayEnabled: z.coerce.boolean(),
});

export type PaymentPlanResult =
  | { ok: true; planId: string; installmentCount: number }
  | { ok: false; error: string };

export async function createPaymentPlanAction(
  _prev: PaymentPlanResult | null,
  formData: FormData,
): Promise<PaymentPlanResult> {
  const user = await requireUser();

  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner" || r === "operator")) {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = planSchema.safeParse({
    patientId: formData.get("patientId"),
    totalAmountCents: formData.get("totalAmountCents"),
    installmentAmountCents: formData.get("installmentAmountCents"),
    frequency: formData.get("frequency"),
    startDate: formData.get("startDate"),
    autopayEnabled: formData.get("autopayEnabled") === "on" || formData.get("autopayEnabled") === "true",
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid payment plan data" };
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  // One active plan per patient — the cron + balance card both assume a single
  // active plan, so block a second rather than silently create a duplicate.
  const existingActive = await prisma.paymentPlan.findFirst({
    where: { patientId: parsed.data.patientId, status: "active" },
    select: { id: true },
  });
  if (existingActive) {
    return { ok: false, error: "This patient already has an active payment plan." };
  }

  const startDate = new Date(parsed.data.startDate);
  if (Number.isNaN(startDate.getTime())) {
    return { ok: false, error: "Invalid start date." };
  }

  try {
    const { plan, installmentCount } = await createPlan({
      organizationId: user.organizationId!,
      patientId: parsed.data.patientId,
      totalAmountCents: parsed.data.totalAmountCents,
      installmentAmountCents: parsed.data.installmentAmountCents,
      frequency: parsed.data.frequency,
      startDate,
      autopayEnabled: parsed.data.autopayEnabled,
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: "patient.payment_plan.created",
        subjectType: "Patient",
        subjectId: parsed.data.patientId,
        metadata: {
          planId: plan.id,
          totalAmountCents: parsed.data.totalAmountCents,
          installmentAmountCents: parsed.data.installmentAmountCents,
          frequency: parsed.data.frequency,
          installmentCount,
          autopay: parsed.data.autopayEnabled,
        },
      },
    });

    revalidatePath(`/clinic/patients/${parsed.data.patientId}`);
    revalidatePath(`/clinic/patients/${parsed.data.patientId}/billing`);
    return { ok: true, planId: plan.id, installmentCount };
  } catch (err) {
    // createPlan throws on out-of-range installment/count — surface it.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to create payment plan",
    };
  }
}

// ---------------------------------------------------------------------------
// Adjust an existing payment plan
// Lets the provider/owner re-level the installment price, frequency, autopay,
// and patient reminder cadence on an active plan (Dr. Patel directive —
// billing Payment Plan "Adjust"). Re-uses the engine's validation + schedule
// math; reminder cadence persists as a structured note tag (no schema change).
// ---------------------------------------------------------------------------

const adjustPlanSchema = z.object({
  planId: z.string().min(1),
  patientId: z.string().min(1),
  installmentAmountCents: z.coerce.number().int().min(1),
  frequency: z.enum(["monthly", "biweekly", "weekly"]),
  autopayEnabled: z.coerce.boolean(),
  reminderCadence: z.enum(["none", "weekly", "3_day", "1_day"]),
});

export type AdjustPlanActionResult =
  | { ok: true; planId: string; numberOfInstallments: number }
  | { ok: false; error: string };

export async function adjustPaymentPlanAction(
  _prev: AdjustPlanActionResult | null,
  formData: FormData,
): Promise<AdjustPlanActionResult> {
  const user = await requireUser();

  if (
    !user.roles.some(
      (r) => r === "clinician" || r === "practice_owner" || r === "operator",
    )
  ) {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = adjustPlanSchema.safeParse({
    planId: formData.get("planId"),
    patientId: formData.get("patientId"),
    installmentAmountCents: formData.get("installmentAmountCents"),
    frequency: formData.get("frequency"),
    autopayEnabled:
      formData.get("autopayEnabled") === "on" ||
      formData.get("autopayEnabled") === "true",
    reminderCadence: formData.get("reminderCadence"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid plan adjustment data" };
  }

  // Defense in depth — reminderCadence is already a zod enum, but keep the
  // engine's source-of-truth list authoritative.
  if (!REMINDER_CADENCES.includes(parsed.data.reminderCadence)) {
    return { ok: false, error: "Invalid reminder cadence" };
  }

  // Verify the plan belongs to this patient + caller's org before touching it.
  const plan = await prisma.paymentPlan.findFirst({
    where: {
      id: parsed.data.planId,
      patientId: parsed.data.patientId,
      organizationId: user.organizationId!,
    },
    select: { id: true },
  });
  if (!plan) return { ok: false, error: "Payment plan not found." };

  try {
    const { numberOfInstallments } = await adjustPlan(parsed.data.planId, {
      newInstallmentCents: parsed.data.installmentAmountCents,
      newFrequency: parsed.data.frequency,
      autopayEnabled: parsed.data.autopayEnabled,
      reminderCadence: parsed.data.reminderCadence,
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: "patient.payment_plan.adjusted",
        subjectType: "Patient",
        subjectId: parsed.data.patientId,
        metadata: {
          planId: parsed.data.planId,
          installmentAmountCents: parsed.data.installmentAmountCents,
          frequency: parsed.data.frequency,
          autopay: parsed.data.autopayEnabled,
          reminderCadence: parsed.data.reminderCadence,
          numberOfInstallments,
        },
      },
    });

    revalidatePath(`/clinic/patients/${parsed.data.patientId}`);
    revalidatePath(`/clinic/patients/${parsed.data.patientId}/billing`);
    return { ok: true, planId: parsed.data.planId, numberOfInstallments };
  } catch (err) {
    // adjustPlan throws on out-of-range installment/count — surface it.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to adjust payment plan",
    };
  }
}

// ---------------------------------------------------------------------------
// Send a statement to the patient by email or text
// Dr. Patel directive (Statement History — "send via email, text"). Routes
// through the single deliverMessage choke-point so the recorded delivery state
// is truthful. PHI-safe: the message carries only the statement number + a link
// to the bare portal — never the balance or any clinical detail.
// ---------------------------------------------------------------------------

const sendStatementSchema = z.object({
  statementId: z.string().min(1),
  channel: z.enum(["email", "sms"]),
});

export type SendStatementResult =
  | { ok: true; delivery: "delivered" | "failed" | "recorded"; detail: string | null }
  | { ok: false; error: string };

export async function sendStatementAction(
  statementId: string,
  channel: "email" | "sms",
): Promise<SendStatementResult> {
  const user = await requireUser();

  if (
    !user.roles.some(
      (r) =>
        r === "front_office" ||
        r === "back_office" ||
        r === "operator" ||
        r === "practice_owner" ||
        r === "practice_admin" ||
        r === "clinician",
    )
  ) {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = sendStatementSchema.safeParse({ statementId, channel });
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const statement = await prisma.statement.findFirst({
    where: {
      id: parsed.data.statementId,
      organizationId: user.organizationId!,
    },
    select: {
      id: true,
      statementNumber: true,
      status: true,
      patientId: true,
      patient: {
        select: { id: true, firstName: true, email: true, phone: true },
      },
    },
  });
  if (!statement) return { ok: false, error: "Statement not found." };

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId! },
    select: { name: true },
  });

  const recipient =
    parsed.data.channel === "email"
      ? statement.patient.email
      : statement.patient.phone;
  if (!recipient) {
    return {
      ok: false,
      error:
        parsed.data.channel === "email"
          ? "No email address on file for this patient."
          : "No phone number on file for this patient.",
    };
  }

  const portalUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
  const notice = buildStatementNotice(parsed.data.channel, {
    statementNumber: statement.statementNumber,
    portalUrl,
    practiceName: org?.name ?? "your care team",
  });

  // Find-or-create a dedicated billing thread so statement notices group
  // together and don't pollute clinical correspondence.
  const BILLING_SUBJECT = "Billing & statements";
  let thread = await prisma.messageThread.findFirst({
    where: { patientId: statement.patientId, subject: BILLING_SUBJECT },
    select: { id: true },
  });
  if (!thread) {
    thread = await prisma.messageThread.create({
      data: { patientId: statement.patientId, subject: BILLING_SUBJECT },
      select: { id: true },
    });
  }

  try {
    const result = await deliverMessage({
      threadId: thread.id,
      channel: parsed.data.channel,
      body: notice.body,
      subject: notice.subject,
      recipient,
      senderUserId: user.id,
      organizationId: user.organizationId!,
    });

    // Mark the statement sent unless the external send hard-failed. A
    // "recorded" outcome (no provider configured) still means we issued it.
    if (result.delivery !== "failed") {
      await prisma.statement.update({
        where: { id: statement.id },
        data: {
          deliveryMethod: parsed.data.channel,
          sentAt: new Date(),
          ...(statement.status === "draft" ? { status: "sent" } : {}),
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: `patient.statement.sent.${parsed.data.channel}`,
        subjectType: "Statement",
        subjectId: statement.id,
        metadata: { channel: parsed.data.channel, delivery: result.delivery },
      },
    });

    revalidatePath(`/clinic/patients/${statement.patientId}/billing`);
    revalidatePath(`/clinic/patients/${statement.patientId}`);
    return { ok: true, delivery: result.delivery, detail: result.detail };
  } catch (err) {
    logger.error({ event: "clinic.billing.statement_send_failed", err });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send statement",
    };
  }
}

// ---------------------------------------------------------------------------
// Notify a patient that their year-end tax summary is ready
// Dr. Patel directive (billing — "Generate tax documents… sendable via email
// and saveable to Correspondence"). Reuses the deliverMessage choke-point + the
// per-patient billing thread. PHI-safe: only the tax year + a bare-portal link.
// ---------------------------------------------------------------------------

const sendTaxSummarySchema = z.object({
  patientId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  channel: z.enum(["email", "sms"]),
});

export async function sendTaxSummaryNotice(
  patientId: string,
  year: number,
  channel: "email" | "sms",
): Promise<SendStatementResult> {
  const user = await requireUser();

  if (
    !user.roles.some(
      (r) =>
        r === "front_office" ||
        r === "back_office" ||
        r === "operator" ||
        r === "practice_owner" ||
        r === "practice_admin" ||
        r === "clinician",
    )
  ) {
    return { ok: false, error: "Unauthorized" };
  }

  const parsed = sendTaxSummarySchema.safeParse({ patientId, year, channel });
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const patient = await prisma.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: { id: true, email: true, phone: true },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  const recipient =
    parsed.data.channel === "email" ? patient.email : patient.phone;
  if (!recipient) {
    return {
      ok: false,
      error:
        parsed.data.channel === "email"
          ? "No email address on file for this patient."
          : "No phone number on file for this patient.",
    };
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId! },
    select: { name: true },
  });
  const portalUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "";
  const notice = buildTaxSummaryNotice(parsed.data.channel, {
    year: parsed.data.year,
    portalUrl,
    practiceName: org?.name ?? "your care team",
  });

  const BILLING_SUBJECT = "Billing & statements";
  let thread = await prisma.messageThread.findFirst({
    where: { patientId: patient.id, subject: BILLING_SUBJECT },
    select: { id: true },
  });
  if (!thread) {
    thread = await prisma.messageThread.create({
      data: { patientId: patient.id, subject: BILLING_SUBJECT },
      select: { id: true },
    });
  }

  try {
    const result = await deliverMessage({
      threadId: thread.id,
      channel: parsed.data.channel,
      body: notice.body,
      subject: notice.subject,
      recipient,
      senderUserId: user.id,
      organizationId: user.organizationId!,
    });

    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: `patient.tax_summary.sent.${parsed.data.channel}`,
        subjectType: "Patient",
        subjectId: patient.id,
        metadata: {
          year: parsed.data.year,
          channel: parsed.data.channel,
          delivery: result.delivery,
        },
      },
    });

    revalidatePath(`/clinic/patients/${patient.id}/billing`);
    return { ok: true, delivery: result.delivery, detail: result.detail };
  } catch (err) {
    logger.error({ event: "clinic.billing.tax_summary_send_failed", err });
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send tax summary",
    };
  }
}
