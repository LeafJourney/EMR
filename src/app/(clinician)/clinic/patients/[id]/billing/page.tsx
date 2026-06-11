import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Eyebrow, LeafSprig, EditorialRule } from "@/components/ui/ornament";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { getPatientFinancialSummary, formatMoney } from "@/lib/domain/billing";
import { CollectPaymentForm } from "./collect-payment-form";
import { PaymentPlanForm } from "./payment-plan-form";
import { EventLog, type EventLogItem } from "./event-log";
import { StatementHistory, type StatementTileItem } from "./statement-history";
import { InsuranceVerify } from "./insurance-verify";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "Billing" };

// ---------------------------------------------------------------------------
// The Patient Billing Tab — Financial Cockpit
// Per PRD section 10: 7 sections that tell one coherent financial story
// ---------------------------------------------------------------------------

export default async function PatientBillingPage({ params }: PageProps) {
  const user = await requireUser();

  // Redirect to main patient chart with billing tab active
  // (This page exists as a standalone too for deep linking)

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });

  if (!patient) notFound();

  const [
    summary,
    claims,
    statements,
    coverage,
    paymentPlan,
    paymentMethods,
    events,
  ] = await Promise.all([
    getPatientFinancialSummary(params.id),
    prisma.claim.findMany({
      where: { patientId: params.id },
      include: { payments: true, encounter: true },
      orderBy: { serviceDate: "desc" },
    }),
    prisma.statement.findMany({
      where: { patientId: params.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.patientCoverage.findFirst({
      where: { patientId: params.id, type: "primary", active: true },
    }),
    prisma.paymentPlan.findFirst({
      where: { patientId: params.id, status: "active" },
    }),
    prisma.storedPaymentMethod.findMany({
      where: { patientId: params.id, active: true },
    }),
    prisma.financialEvent.findMany({
      where: { patientId: params.id },
      orderBy: { occurredAt: "desc" },
      take: 20,
    }),
  ]);

  // Pre-format events for the collapsible client log (EMR-910) so the client
  // component never imports the billing/prisma layer.
  const eventItems: EventLogItem[] = events.map((event) => {
    const positive =
      event.amountCents > 0 &&
      (event.type === "patient_payment" || event.type === "insurance_paid");
    return {
      id: event.id,
      description: event.description,
      amountLabel:
        event.amountCents !== 0
          ? `${event.amountCents > 0 ? "+" : ""}${formatMoney(event.amountCents)}`
          : "",
      amountClass: positive
        ? "text-success"
        : event.amountCents < 0
          ? "text-text-muted"
          : "text-text",
      meta: `${formatRelative(event.occurredAt)} · ${event.type.replace(/_/g, " ")}`,
      color: eventColor(event.type),
    };
  });

  // Pre-format statements for the collapsible client tiles so the client
  // component never imports the billing/prisma layer (mirrors eventItems).
  const statementItems: StatementTileItem[] = statements.map((statement) => ({
    id: statement.id,
    statementNumber: statement.statementNumber,
    dateLabel: `Due ${formatDate(statement.dueDate)}`,
    amountLabel: formatMoney(statement.amountDueCents),
    status: statement.status,
    statusTone:
      statement.status === "paid" || statement.status === "sent"
        ? "success"
        : statement.status === "overdue"
          ? "danger"
          : statement.status === "viewed"
            ? "accent"
            : "warning",
    detailLine: `Sent ${
      statement.sentAt ? formatRelative(statement.sentAt) : "not sent"
    } · Due ${formatDate(statement.dueDate)}${
      statement.viewedAt ? ` · Viewed ${formatRelative(statement.viewedAt)}` : ""
    }`,
    deliveryMethod: statement.deliveryMethod,
    invoiceHref: `/clinic/patients/${params.id}/billing/invoice/${statement.id}`,
    plainLanguageSummary: statement.plainLanguageSummary,
  }));

  return (
    <PageShell maxWidth="max-w-[1280px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Avatar
            firstName={patient.firstName}
            lastName={patient.lastName}
            size="lg"
          />
          <div>
            <Eyebrow className="mb-2">Billing</Eyebrow>
            <h1 className="font-display text-2xl text-text tracking-tight">
              Billing —{" "}
              <Link
                href={`/clinic/patients/${params.id}`}
                className="hover:text-accent transition-colors"
              >
                {patient.firstName} {patient.lastName}
              </Link>
            </h1>
            <p className="text-sm text-text-muted mt-0.5">
              Complete financial story, plain-language explanations, one-click collection.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/clinic/patients/${params.id}`}>
            <Button variant="secondary" size="sm">
              Back to chart
            </Button>
          </Link>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════ */}
      {/* A. Balance Summary — the financial hero                   */}
      {/* ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <div className="lg:col-span-2">
          <Card
            tone="raised"
            className={`border-l-4 ${
              summary.overdueCents > 0
                ? "border-l-danger"
                : summary.currentDueCents > 0
                  ? "border-l-[color:var(--warning)]"
                  : "border-l-success"
            }`}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">Current balance</CardTitle>
                  <CardDescription>
                    {summary.currentDueCents === 0
                      ? "No balance due"
                      : `Last payment ${summary.lastPaymentDate ? formatRelative(summary.lastPaymentDate) : "none recorded"}`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {paymentMethods.length > 0 && (
                    <Badge tone="success">Card on file</Badge>
                  )}
                  {paymentPlan && <Badge tone="accent">On payment plan</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <BalanceLine
                  label="Total balance"
                  value={formatMoney(summary.totalBalanceCents)}
                  tone="primary"
                />
                <BalanceLine
                  label="Patient due"
                  value={formatMoney(summary.currentDueCents)}
                  tone={summary.currentDueCents > 0 ? "warning" : "neutral"}
                />
                <BalanceLine
                  label="Insurance pending"
                  value={formatMoney(summary.insurancePendingCents)}
                  tone="neutral"
                />
                <BalanceLine
                  label="Overdue"
                  value={formatMoney(summary.overdueCents)}
                  tone={summary.overdueCents > 0 ? "danger" : "neutral"}
                />
              </div>
              {/* EMR-905 — accepted payment method pills */}
              <div className="mt-5 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-text-subtle uppercase tracking-wider mr-1">
                  Accepted
                </span>
                {[
                  { m: "Card", on: paymentMethods.length > 0 },
                  { m: "ACH", on: false },
                  { m: "Cash", on: false },
                  { m: "Check", on: false },
                ].map(({ m, on }) => (
                  <span
                    key={m}
                    className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      on
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-surface-muted text-text-muted border-border"
                    }`}
                  >
                    {m}
                    {on ? " · on file" : ""}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment center — quick actions */}
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LeafSprig size={14} className="text-accent" />
              Payment center
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CollectPaymentForm
              patientId={params.id}
              suggestedAmountCents={summary.currentDueCents}
              hasCardOnFile={paymentMethods.length > 0}
              cardLast4={paymentMethods[0]?.last4 ?? null}
              cardBrand={paymentMethods[0]?.brand ?? null}
            />
          </CardContent>
        </Card>
      </div>

      {/* ═════════════════════════════════════════════════════════ */}
      {/* B. Responsibility Breakdown                               */}
      {/* ═════════════════════════════════════════════════════════ */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Responsibility breakdown</Eyebrow>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat
            label="Copay collected"
            value={formatMoney(summary.copayPaidCents)}
            hint={
              summary.copayOwedCents > 0
                ? `${formatMoney(summary.copayOwedCents)} owed`
                : "Up to date"
            }
            tone={summary.copayOwedCents > 0 ? "warning" : "success"}
          />
          <MiniStat
            label="Deductible applied"
            value={formatMoney(summary.deductibleAppliedCents)}
            hint={
              coverage?.deductibleCents
                ? `of ${formatMoney(coverage.deductibleCents)} annual`
                : "No plan on file"
            }
          />
          <MiniStat
            label="Patient responsibility"
            value={formatMoney(summary.patientResponsibilityCents)}
            hint="From adjudicated claims"
            tone={summary.patientResponsibilityCents > 0 ? "warning" : "success"}
          />
          <MiniStat
            label="Credit balance"
            value={formatMoney(summary.creditBalanceCents)}
            hint={
              summary.creditBalanceCents > 0
                ? "Available to apply"
                : "None"
            }
            tone={summary.creditBalanceCents > 0 ? "accent" : "neutral"}
          />
        </div>
      </div>

      <EditorialRule className="my-10" />

      {/* ═════════════════════════════════════════════════════════ */}
      {/* C. Encounter Financial Timeline                           */}
      {/* ═════════════════════════════════════════════════════════ */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Encounter financial timeline</Eyebrow>
        {claims.length === 0 ? (
          <Card tone="raised">
            <CardContent className="py-10 text-center text-text-muted">
              No claims yet. Finalize a visit note to generate charges.
            </CardContent>
          </Card>
        ) : (
          <Card tone="raised">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider">Date</th>
                      <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider">Service</th>
                      <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider text-right">Charge</th>
                      <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider text-right">Insurance</th>
                      <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider text-right">Adjustment</th>
                      <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider text-right">Patient</th>
                      <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider text-right">Balance</th>
                      <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {claims.map((claim) => {
                      const cpts = claim.cptCodes as Array<{ code: string; label: string }>;
                      const insurancePaid = claim.payments
                        .filter((p) => p.source === "insurance")
                        .reduce((a, p) => a + p.amountCents, 0);
                      const patientPaid = claim.payments
                        .filter((p) => p.source === "patient")
                        .reduce((a, p) => a + p.amountCents, 0);
                      const adjustment =
                        claim.allowedAmountCents != null
                          ? claim.billedAmountCents - claim.allowedAmountCents
                          : 0;
                      const balance = claim.patientRespCents - patientPaid;
                      return (
                        <tr key={claim.id} className="hover:bg-surface-muted/40">
                          <td className="py-3 px-5 text-text-muted tabular-nums text-xs">
                            {formatDate(claim.serviceDate)}
                          </td>
                          <td className="py-3 px-5">
                            <div className="flex flex-wrap gap-1">
                              {cpts.map((c) => (
                                <span
                                  key={c.code}
                                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent"
                                  title={c.label}
                                >
                                  {c.code}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-5 text-right tabular-nums text-text">
                            {formatMoney(claim.billedAmountCents)}
                          </td>
                          <td className="py-3 px-5 text-right tabular-nums text-success">
                            {insurancePaid > 0 ? formatMoney(insurancePaid) : "—"}
                          </td>
                          <td className="py-3 px-5 text-right tabular-nums text-text-muted">
                            {adjustment > 0 ? `(${formatMoney(adjustment)})` : "—"}
                          </td>
                          <td className="py-3 px-5 text-right tabular-nums">
                            {claim.patientRespCents > 0 ? formatMoney(claim.patientRespCents) : "—"}
                          </td>
                          <td className="py-3 px-5 text-right tabular-nums font-medium">
                            <span className={balance > 0 ? "text-[color:var(--warning)]" : "text-text-subtle"}>
                              {formatMoney(balance)}
                            </span>
                          </td>
                          <td className="py-3 px-5">
                            <Badge
                              tone={
                                claim.status === "paid"
                                  ? "success"
                                  : claim.status === "denied"
                                    ? "danger"
                                    : claim.status === "partial"
                                      ? "accent"
                                      : "warning"
                              }
                              className="text-[10px]"
                            >
                              {claim.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════ */}
      {/* F. Insurance & Benefits Snapshot                          */}
      {/* ═════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Insurance & benefits</CardTitle>
            <CardDescription>
              {coverage?.eligibilityLastCheckedAt
                ? `Last verified ${formatRelative(coverage.eligibilityLastCheckedAt)}`
                : "Not yet verified"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {coverage ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge tone={coverage.eligibilityStatus === "active" ? "success" : "warning"}>
                    {coverage.eligibilityStatus}
                  </Badge>
                  <span className="text-sm font-medium text-text">
                    {coverage.payerName}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                  <DetailRow label="Plan" value={coverage.planName ?? "—"} />
                  <DetailRow label="Member ID" value={coverage.memberId} mono />
                  {coverage.groupNumber && (
                    <DetailRow label="Group" value={coverage.groupNumber} mono />
                  )}
                  {coverage.copayCents != null && (
                    <DetailRow label="Copay" value={formatMoney(coverage.copayCents)} />
                  )}
                  {coverage.deductibleCents != null && (
                    <DetailRow
                      label="Deductible"
                      value={`${formatMoney(coverage.deductibleMetCents)} / ${formatMoney(coverage.deductibleCents)}`}
                    />
                  )}
                  {coverage.outOfPocketMaxCents != null && (
                    <DetailRow
                      label="Out-of-Pocket Max"
                      value={`${formatMoney(coverage.outOfPocketMetCents)} / ${formatMoney(coverage.outOfPocketMaxCents)}`}
                    />
                  )}
                  {coverage.coinsurancePct != null && (
                    <DetailRow label="Coinsurance" value={`${coverage.coinsurancePct}%`} />
                  )}
                </div>
                {coverage.deductibleCents && (
                  <div>
                    <div className="flex items-center justify-between text-xs text-text-subtle mb-1">
                      <span>Deductible progress</span>
                      <span>
                        {Math.round(
                          (coverage.deductibleMetCents / coverage.deductibleCents) * 100,
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-accent to-accent-strong rounded-full"
                        style={{
                          width: `${Math.min(100, (coverage.deductibleMetCents / coverage.deductibleCents) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="pt-1">
                  <InsuranceVerify
                    payerName={coverage.payerName}
                    planName={coverage.planName}
                    memberId={coverage.memberId}
                    eligibilityStatus={coverage.eligibilityStatus}
                    practiceName="This practice"
                    lastCheckedLabel={
                      coverage.eligibilityLastCheckedAt
                        ? `Last verified ${formatRelative(coverage.eligibilityLastCheckedAt)}`
                        : "Not yet verified"
                    }
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                No insurance on file. Patient will be self-pay.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Payment plan status */}
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Payment plan</CardTitle>
            <CardDescription>
              {paymentPlan
                ? "Active installment plan on this account"
                : "No active payment plan"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paymentPlan ? (
              <div className="space-y-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="font-display text-2xl text-text tabular-nums">
                      {formatMoney(paymentPlan.installmentAmountCents)}
                    </p>
                    <p className="text-xs text-text-subtle">
                      per {paymentPlan.frequency} installment
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-text font-medium">
                      {paymentPlan.installmentsPaid} / {paymentPlan.numberOfInstallments}
                    </p>
                    <p className="text-[10px] text-text-subtle">paid</p>
                  </div>
                </div>
                <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full"
                    style={{
                      width: `${(paymentPlan.installmentsPaid / paymentPlan.numberOfInstallments) * 100}%`,
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-text-subtle">Total</p>
                    <p className="text-text tabular-nums">
                      {formatMoney(paymentPlan.totalAmountCents)}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-subtle">Next due</p>
                    <p className="text-text">
                      {paymentPlan.nextPaymentDate
                        ? formatDate(paymentPlan.nextPaymentDate)
                        : "—"}
                    </p>
                  </div>
                </div>
                {paymentPlan.autopayEnabled && (
                  <Badge tone="success">Autopay enabled</Badge>
                )}
              </div>
            ) : (
              <PaymentPlanForm
                patientId={params.id}
                outstandingCents={summary.currentDueCents}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═════════════════════════════════════════════════════════ */}
      {/* E. Statement History                                      */}
      {/* ═════════════════════════════════════════════════════════ */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Statement history</Eyebrow>
        {statements.length === 0 ? (
          <Card tone="raised">
            <CardContent className="py-8 text-center text-text-muted text-sm">
              No statements yet.
            </CardContent>
          </Card>
        ) : (
          <StatementHistory statements={statementItems} />
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════ */}
      {/* G. Audit Trail / Financial Events                         */}
      {/* ═════════════════════════════════════════════════════════ */}
      <div>
        <Eyebrow className="mb-4">Financial event log</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-6 pb-6">
            <EventLog events={eventItems} />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function eventColor(type: string): string {
  if (type.includes("paid") || type.includes("payment")) return "var(--success)";
  if (type.includes("denied")) return "var(--danger)";
  if (type.includes("adjustment") || type.includes("write_off")) return "var(--text-subtle)";
  if (type.includes("copay")) return "var(--highlight)";
  return "var(--accent)";
}

function BalanceLine({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "primary" | "warning" | "danger" | "neutral";
}) {
  const colors = {
    primary: "text-text",
    warning: "text-[color:var(--warning)]",
    danger: "text-danger",
    neutral: "text-text-subtle",
  };
  return (
    <div>
      <p className="text-[10px] text-text-subtle uppercase tracking-wider">
        {label}
      </p>
      <p className={`font-display text-2xl tabular-nums mt-1 ${colors[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "accent" | "success" | "warning" | "neutral";
}) {
  const colors = {
    accent: "text-accent",
    success: "text-success",
    warning: "text-[color:var(--warning)]",
    neutral: "text-text",
  };
  return (
    <Card tone="raised">
      <CardContent className="pt-4 pb-4">
        <p className="text-[10px] text-text-subtle uppercase tracking-wider">
          {label}
        </p>
        <p className={`font-display text-xl tabular-nums mt-1 ${colors[tone]}`}>
          {value}
        </p>
        <p className="text-[10px] text-text-subtle mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-text-subtle uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-text ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}
