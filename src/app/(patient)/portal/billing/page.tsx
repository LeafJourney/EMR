import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { Eyebrow, LeafSprig, EditorialRule } from "@/components/ui/ornament";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { getPatientFinancialSummary, formatMoney } from "@/lib/domain/billing";

export const metadata = { title: "Billing" };

// ---------------------------------------------------------------------------
// Patient-facing billing page — warm, plain-language, easy to understand
// ---------------------------------------------------------------------------

export default async function PortalBillingPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });

  if (!patient) redirect("/portal/intake");

  const [summary, statements, coverage, paymentPlan, paymentMethods] =
    await Promise.all([
      getPatientFinancialSummary(patient.id),
      prisma.statement.findMany({
        where: { patientId: patient.id, status: { not: "voided" } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.patientCoverage.findFirst({
        where: { patientId: patient.id, type: "primary", active: true },
      }),
      prisma.paymentPlan.findFirst({
        where: { patientId: patient.id, status: "active" },
      }),
      prisma.storedPaymentMethod.findMany({
        where: { patientId: patient.id, active: true },
      }),
    ]);

  const hasBalance = summary.currentDueCents > 0;

  return (
    <PageShell maxWidth="max-w-[860px]">
      <PageHeader
        eyebrow="Billing"
        title="Your billing"
        description="Everything you owe, everything your insurance covered, all in one place — explained in plain language."
      />

      <PatientSectionNav section="account" />

      {/* Pilot Warning Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 items-start mb-6">
        <span className="text-amber-800 text-base mt-0.5">⚠️</span>
        <div>
          <p className="text-sm font-medium text-amber-800">Online bill pay is in pilot preparation</p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            Please settle balances at the clinic front desk. Online payments are currently disabled.
          </p>
        </div>
      </div>

      {/* Year-end tax summary link */}
      <div className="flex justify-end mb-4">
        <Link href="/portal/billing/tax-summary">
          <Button variant="ghost" size="sm">
            Year-end tax summary
          </Button>
        </Link>
      </div>

      {/* Hero balance card */}
      <Card
        tone="ambient"
        className={`mb-8 ${hasBalance ? "border-l-4 border-l-[color:var(--warning)]" : ""}`}
      >
        <CardContent className="py-10 text-center">
          {hasBalance ? (
            <>
              <Eyebrow className="justify-center mb-4">Balance due</Eyebrow>
              <p className="font-display text-5xl md:text-6xl text-text tabular-nums leading-none">
                {formatMoney(summary.currentDueCents)}
              </p>
              {summary.overdueCents > 0 && (
                <p className="text-sm text-danger mt-3 font-medium">
                  {formatMoney(summary.overdueCents)} is past due
                </p>
              )}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button size="lg" disabled>Pay now</Button>
                {!paymentPlan && (
                  <Button variant="secondary" size="lg" disabled>
                    Set up payment plan
                  </Button>
                )}
              </div>
              {paymentMethods.length > 0 && (
                <p className="text-xs text-text-subtle mt-5">
                  We&apos;ll use {paymentMethods[0].brand} •{paymentMethods[0].last4} on file.
                </p>
              )}
            </>
          ) : (
            <>
              <LeafSprig size={32} className="text-accent mx-auto mb-4" />
              <h2 className="font-display text-2xl text-text tracking-tight">
                You&apos;re all caught up
              </h2>
              <p className="text-sm text-text-muted mt-3 max-w-md mx-auto leading-relaxed">
                No balance owed right now. When new bills come in, we&apos;ll explain
                them here in plain language before asking you to pay.
              </p>
            </>
          )}
          {/* EMR-1116 (PJ-4 minor): disputes were filed-able but unfindable
              from the main billing card. */}
          <p className="mt-6 text-sm text-text-muted">
            Something looks wrong?{" "}
            <Link
              href="/portal/billing/disputes"
              className="text-accent underline underline-offset-2 hover:text-accent/80"
            >
              View disputes
            </Link>
          </p>
        </CardContent>
      </Card>

      {/* Active payment plan */}
      {paymentPlan && (
        <Card tone="raised" className="mb-8 border-l-4 border-l-accent">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LeafSprig size={14} className="text-accent" />
              Your payment plan
            </CardTitle>
            <CardDescription>
              {formatMoney(paymentPlan.installmentAmountCents)} per{" "}
              {paymentPlan.frequency} until paid in full
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-text">
                {paymentPlan.installmentsPaid} of{" "}
                {paymentPlan.numberOfInstallments} payments made
              </span>
              <span className="text-sm text-text font-medium tabular-nums">
                {formatMoney(
                  paymentPlan.totalAmountCents - paymentPlan.paidAmountCents,
                )}{" "}
                left
              </span>
            </div>
            <div className="h-2 bg-surface-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent-strong rounded-full"
                style={{
                  width: `${(paymentPlan.installmentsPaid / paymentPlan.numberOfInstallments) * 100}%`,
                }}
              />
            </div>
            {paymentPlan.nextPaymentDate && (
              <p className="text-xs text-text-muted">
                Next payment: {formatDate(paymentPlan.nextPaymentDate)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Statements — the most important patient-facing surface */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Your statements</Eyebrow>
        {statements.length === 0 ? (
          <EmptyState
            title="No statements yet"
            description="When you receive a bill, it will show up here with a plain-language explanation of what you owe and why."
          />
        ) : (
          <div className="space-y-4">
            {statements.map((statement) => {
              const remaining =
                statement.amountDueCents - statement.paidToDateCents;
              return (
                <Card key={statement.id} tone="raised">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
                          {statement.statementNumber}
                        </p>
                        <p className="text-sm text-text mt-1">
                          For {formatDate(statement.periodStart)} —{" "}
                          {formatDate(statement.periodEnd)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-2xl text-text tabular-nums">
                          {formatMoney(remaining)}
                        </p>
                        <Badge
                          tone={
                            statement.status === "paid"
                              ? "success"
                              : statement.status === "overdue"
                                ? "danger"
                                : "warning"
                          }
                          className="text-[10px] mt-1"
                        >
                          {statement.status === "paid"
                            ? "Paid"
                            : `Due ${formatDate(statement.dueDate)}`}
                        </Badge>
                      </div>
                    </div>

                    {statement.plainLanguageSummary && (
                      <div className="p-4 rounded-lg bg-accent/[0.04] border border-accent/15 mb-4">
                        <div className="flex items-start gap-2">
                          <LeafSprig
                            size={14}
                            className="text-accent mt-0.5 shrink-0"
                          />
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-accent mb-1">
                              What this is for
                            </p>
                            <p className="text-sm text-text leading-relaxed">
                              {statement.plainLanguageSummary}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Line items breakdown */}
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-text-muted">
                        <span>Total charges</span>
                        <span className="tabular-nums">
                          {formatMoney(statement.totalChargesCents)}
                        </span>
                      </div>
                      {statement.insurancePaidCents > 0 && (
                        <div className="flex justify-between text-success">
                          <span>Insurance paid</span>
                          <span className="tabular-nums">
                            −{formatMoney(statement.insurancePaidCents)}
                          </span>
                        </div>
                      )}
                      {statement.adjustmentsCents > 0 && (
                        <div className="flex justify-between text-text-subtle">
                          <span>Plan adjustment</span>
                          <span className="tabular-nums">
                            −{formatMoney(statement.adjustmentsCents)}
                          </span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-border flex justify-between font-medium text-text">
                        <span>Your portion</span>
                        <span className="tabular-nums">
                          {formatMoney(statement.amountDueCents)}
                        </span>
                      </div>
                      {statement.paidToDateCents > 0 && (
                        <>
                          <div className="flex justify-between text-success text-xs">
                            <span>Already paid</span>
                            <span className="tabular-nums">
                              {formatMoney(statement.paidToDateCents)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {statement.status !== "paid" && remaining > 0 && (
                      <div className="mt-4 flex gap-2">
                        <Button size="sm" disabled>Pay {formatMoney(remaining)}</Button>
                        <Link href="/portal/messages">
                          <Button variant="secondary" size="sm">
                            Questions?
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <EditorialRule className="my-10" />

      {/* Insurance snapshot */}
      {coverage && (
        <Card tone="raised" className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Your insurance</CardTitle>
            <CardDescription>
              What your plan looks like right now
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-5">
              <Badge
                tone={coverage.eligibilityStatus === "active" ? "success" : "warning"}
              >
                {coverage.eligibilityStatus === "active" ? "Active" : coverage.eligibilityStatus}
              </Badge>
              <span className="text-sm font-medium text-text">
                {coverage.payerName}
              </span>
              {coverage.planName && (
                <span className="text-xs text-text-subtle">
                  · {coverage.planName}
                </span>
              )}
            </div>

            {coverage.deductibleCents && (
              <div className="mb-4">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-text-muted">
                    Deductible progress
                  </span>
                  <span className="text-xs text-text tabular-nums">
                    {formatMoney(coverage.deductibleMetCents)} /{" "}
                    {formatMoney(coverage.deductibleCents)}
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
                <p className="text-[11px] text-text-subtle mt-1">
                  Once you hit your deductible, your insurance covers more of
                  the cost of each visit.
                </p>
              </div>
            )}

            {coverage.outOfPocketMaxCents && (
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-xs text-text-muted">
                    Out-of-pocket max
                  </span>
                  <span className="text-xs text-text tabular-nums">
                    {formatMoney(coverage.outOfPocketMetCents)} /{" "}
                    {formatMoney(coverage.outOfPocketMaxCents)}
                  </span>
                </div>
                <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-highlight to-highlight-hover rounded-full"
                    style={{
                      width: `${Math.min(100, (coverage.outOfPocketMetCents / coverage.outOfPocketMaxCents) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-text-subtle mt-1">
                  Once you hit your out-of-pocket max, your insurance covers
                  100% of covered services for the rest of the year.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Help card */}
      <Card tone="raised" className="mb-8">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <LeafSprig size={20} className="text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text">
                Questions about a bill?
              </p>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                We believe you should always understand what you&apos;re paying
                for. If anything here is confusing, tap &quot;Questions?&quot;
                on any statement or message our billing team — we&apos;ll
                explain everything in plain language.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
