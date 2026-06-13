/**
 * Patient statement generator + dispatcher  (EMR-225)
 * --------------------------------------------------------------
 * Persistence layer over `patient-statements.ts`. Walks every patient
 * with a positive responsibility balance, applies the 30-day cadence
 * rule, and persists a `Statement` row when one is due.
 *
 * Multi-channel dispatch: portal + email + SMS + paper. Real delivery
 * is deferred to the EMR-211 reminder orchestration; this module
 * records the intent (`statement.deliveryMethod`, `sentAt`) and emits
 * a `statement.dispatched` AgentJob the reminder fleet picks up.
 */
import { prisma } from "@/lib/db/prisma";
import {
  generateStatementNumber,
  decideCadence,
  aggregateStatement,
  defaultPlainLanguageSummary,
  type StatementCadenceDecision,
  type StatementLineItem,
} from "./patient-statements";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type DeliveryChannel = "portal" | "email" | "sms" | "mail";

export interface GenerateBatchInput {
  organizationId: string;
  /** Override "today" for testing / manual back-dated runs. */
  asOf?: Date;
  /** Limit run size — default 500 statements per pass. Larger orgs
   *  pick up the rest on the next 23:59 close. */
  maxStatements?: number;
}

export interface GenerateBatchResult {
  considered: number;
  issued: number;
  skipped: number;
  errors: Array<{ patientId: string; reason: string }>;
}

/** Walk every patient with patientResp > 0, decide cadence, generate
 *  + persist statements that are due today. */
export async function generateStatementBatch(input: GenerateBatchInput): Promise<GenerateBatchResult> {
  const today = input.asOf ?? new Date();
  const limit = input.maxStatements ?? 500;
  const patients = await loadPatientsWithBalance(input.organizationId, limit);

  const todaysIssuedSoFar = await prisma.statement.count({
    where: {
      organizationId: input.organizationId,
      sentAt: { gte: startOfDay(today), lt: addDays(startOfDay(today), 1) },
    },
  });
  let issuedThisRun = todaysIssuedSoFar;

  const result: GenerateBatchResult = {
    considered: patients.length,
    issued: 0,
    skipped: 0,
    errors: [],
  };

  for (const p of patients) {
    try {
      const decision = await evaluatePatient(input.organizationId, p, today);
      if (!decision.shouldIssue) {
        result.skipped++;
        continue;
      }
      const statementNumber = generateStatementNumber(today, issuedThisRun);
      issuedThisRun++;
      await issueStatement({
        organizationId: input.organizationId,
        patientId: p.patientId,
        firstName: p.firstName,
        statementNumber,
        decision,
        today,
      });
      result.issued++;
    } catch (err) {
      result.errors.push({ patientId: p.patientId, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Patient-level evaluation + issue
// ---------------------------------------------------------------------------

interface PatientWithBalance {
  patientId: string;
  firstName: string;
  amountDueCents: number;
  firstResponsibilityAt: Date;
  lastStatementSentAt: Date | null;
  lastPatientPaymentAt: Date | null;
  onPaymentPlan: boolean;
}

async function loadPatientsWithBalance(organizationId: string, limit: number): Promise<PatientWithBalance[]> {
  // Patients with any open patient-responsibility balance + no active
  // payment plan. We pull a wide set; the cadence filter trims it down.
  const rows = await prisma.patient.findMany({
    where: {
      organizationId,
      claims: { some: { patientRespCents: { gt: 0 } } },
    },
    select: {
      id: true,
      firstName: true,
      claims: {
        select: { patientRespCents: true, paidAmountCents: true, billedAmountCents: true },
      },
      paymentPlans: {
        where: { status: "active" },
        select: { id: true },
      },
    },
    take: limit,
  });
  const out: PatientWithBalance[] = [];
  for (const r of rows) {
    const dueCents = r.claims.reduce((a, c) => a + Math.max(0, c.patientRespCents), 0);
    if (dueCents <= 0) continue;
    const [firstEvent, lastStatement, lastPayment] = await Promise.all([
      prisma.financialEvent.findFirst({
        where: { patientId: r.id, type: "patient_responsibility_transferred" },
        orderBy: { occurredAt: "asc" },
        select: { occurredAt: true },
      }),
      prisma.statement.findFirst({
        where: { patientId: r.id, sentAt: { not: null } },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
      prisma.financialEvent.findFirst({
        where: { patientId: r.id, type: "patient_payment" },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
    ]);
    if (!firstEvent) continue; // no responsibility event yet — claim path hasn't completed
    out.push({
      patientId: r.id,
      firstName: r.firstName,
      amountDueCents: dueCents,
      firstResponsibilityAt: firstEvent.occurredAt,
      lastStatementSentAt: lastStatement?.sentAt ?? null,
      lastPatientPaymentAt: lastPayment?.occurredAt ?? null,
      onPaymentPlan: r.paymentPlans.length > 0,
    });
  }
  return out;
}

async function evaluatePatient(
  _orgId: string,
  p: PatientWithBalance,
  today: Date,
): Promise<StatementCadenceDecision> {
  return decideCadence(
    {
      firstResponsibilityAt: p.firstResponsibilityAt,
      lastStatementSentAt: p.lastStatementSentAt,
      lastPatientPaymentAt: p.lastPatientPaymentAt,
      amountDueCents: p.amountDueCents,
      onPaymentPlan: p.onPaymentPlan,
    },
    today,
  );
}

interface IssueArgs {
  organizationId: string;
  patientId: string;
  firstName: string;
  statementNumber: string;
  decision: StatementCadenceDecision;
  today: Date;
}

async function issueStatement(args: IssueArgs): Promise<void> {
  const periodEnd = startOfDay(args.today);
  const periodStart = addDays(periodEnd, -30);
  const dueDate = addDays(periodEnd, 30);

  const lineItems = await loadLineItems(args.patientId, periodStart, periodEnd);
  const priorBalance = await loadPriorBalance(args.patientId);
  const insurancePaid = await sumByType(args.patientId, "insurance_paid", periodStart, periodEnd);
  const adjustments = await sumByType(args.patientId, "contractual_adjustment", periodStart, periodEnd);
  const paidToDate = await sumByType(args.patientId, "patient_payment", periodStart, periodEnd);

  // FinancialEvent stores money-in (insurance_paid, patient_payment) as a
  // positive amount, and aggregateStatement SUBTRACTS insurancePaidCents and
  // paidToDateCents to compute amount-due. So they must be passed positive —
  // negating them flipped the math, ADDING payments to the patient's balance
  // and persisting negative paid columns on the statement.
  const agg = aggregateStatement({
    lineItems,
    insurancePaidCents: insurancePaid,
    adjustmentsCents: adjustments,
    priorBalanceCents: priorBalance,
    paidToDateCents: paidToDate,
  });

  const channel = await preferredChannel(args.patientId);
  const summary = defaultPlainLanguageSummary({
    patientFirstName: args.firstName,
    agg,
    dueDate,
  });

  await prisma.statement.create({
    data: {
      organizationId: args.organizationId,
      patientId: args.patientId,
      statementNumber: args.statementNumber,
      periodStart,
      periodEnd,
      dueDate,
      totalChargesCents: agg.totalChargesCents,
      insurancePaidCents: agg.insurancePaidCents,
      adjustmentsCents: agg.adjustmentsCents,
      priorBalanceCents: agg.priorBalanceCents,
      paidToDateCents: agg.paidToDateCents,
      amountDueCents: agg.amountDueCents,
      status: "sent",
      deliveryMethod: channel,
      sentAt: args.today,
      lineItems: lineItems.map(serializeLineItem) as unknown as object,
      plainLanguageSummary: summary,
    },
  });

  // Record a FinancialEvent so the ledger has an audit trail of when
  // statements went out (keys off StatementStatus events too).
  await prisma.financialEvent.create({
    data: {
      organizationId: args.organizationId,
      patientId: args.patientId,
      type: "statement_issued",
      amountCents: agg.amountDueCents,
      description: `${args.statementNumber} — ${args.decision.cycle} statement`,
      metadata: { statementNumber: args.statementNumber, channel, cycle: args.decision.cycle },
      createdByAgent: "statement-generator@1.0",
    },
  });

  // Hand off to the reminder orchestration for actual delivery on the
  // chosen channel. The reminder agent is responsible for the email
  // body / SMS template / printable PDF — this module just records intent.
  await prisma.agentJob.create({
    data: {
      organizationId: args.organizationId,
      workflowName: "patient-reminder-orchestration",
      agentName: "statement-dispatch",
      eventName: "statement.dispatch",
      status: "pending",
      input: {
        statementNumber: args.statementNumber,
        patientId: args.patientId,
        channel,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Channel selection
// ---------------------------------------------------------------------------

async function preferredChannel(patientId: string): Promise<DeliveryChannel> {
  // CommunicationPreference is keyed by userId, so we have to bridge
  // through Patient.userId. Patients without an associated User row
  // (paper-only intake) skip straight to portal default.
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { userId: true, email: true, phone: true },
  });
  if (!patient || !patient.userId) {
    return patient?.email ? "email" : "mail";
  }
  const pref = await prisma.communicationPreference.findUnique({
    where: { userId: patient.userId },
    select: { smsOptIn: true, emailFrequency: true },
  });
  if (!pref) return patient.email ? "email" : "portal";
  if (pref.smsOptIn && patient.phone) return "sms";
  if (pref.emailFrequency !== "off" && patient.email) return "email";
  return "portal";
}

// ---------------------------------------------------------------------------
// Aggregation reads
// ---------------------------------------------------------------------------

async function loadLineItems(
  patientId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<StatementLineItem[]> {
  const events = await prisma.financialEvent.findMany({
    where: {
      patientId,
      type: { in: ["charge_created", "patient_responsibility_transferred"] },
      occurredAt: { gte: periodStart, lt: periodEnd },
    },
    orderBy: { occurredAt: "asc" },
    select: {
      description: true,
      amountCents: true,
      claimId: true,
      encounterId: true,
      metadata: true,
      occurredAt: true,
    },
  });
  return events.map((e) => {
    const meta = (e.metadata as Record<string, unknown> | null) ?? {};
    return {
      description: e.description,
      amountCents: e.amountCents,
      encounterId: e.encounterId,
      cptCode: typeof meta.cptCode === "string" ? meta.cptCode : null,
      serviceDate: e.occurredAt,
    };
  });
}

async function loadPriorBalance(patientId: string): Promise<number> {
  const lastStatement = await prisma.statement.findFirst({
    where: { patientId, sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { amountDueCents: true, paidToDateCents: true },
  });
  if (!lastStatement) return 0;
  return Math.max(0, lastStatement.amountDueCents - lastStatement.paidToDateCents);
}

async function sumByType(
  patientId: string,
  type:
    | "insurance_paid"
    | "contractual_adjustment"
    | "patient_payment",
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const r = await prisma.financialEvent.aggregate({
    where: {
      patientId,
      type,
      occurredAt: { gte: periodStart, lt: periodEnd },
    },
    _sum: { amountCents: true },
  });
  return r._sum.amountCents ?? 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeLineItem(li: StatementLineItem) {
  return {
    description: li.description,
    amountCents: li.amountCents,
    encounterId: li.encounterId,
    cptCode: li.cptCode,
    serviceDate: li.serviceDate?.toISOString() ?? null,
  };
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}
