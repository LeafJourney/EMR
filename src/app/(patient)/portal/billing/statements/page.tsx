import Link from "next/link";
import { redirect } from "next/navigation";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow, LeafSprig, EditorialRule } from "@/components/ui/ornament";
import { formatDate } from "@/lib/utils/format";
import { formatMoney } from "@/lib/domain/billing";
import { buildPatientView } from "@/lib/billing/eob-display";
import { buildEobFromEra835 } from "@/lib/billing/eob";

export const metadata = { title: "Your statements" };

// ---------------------------------------------------------------------------
// EMR-068 — Patient billing portal statements view
// Shows every statement, with the AI-generated plain-language EOB summary
// when one exists, plus the full insurance breakdown. Pay buttons + payment
// plan setup live alongside each balance.
// ---------------------------------------------------------------------------

export default async function PatientStatementsPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({ where: { userId: user.id } });
  if (!patient) redirect("/portal/intake");

  const [statements, paymentMethods, paymentPlan, recentPayments] =
    await Promise.all([
      prisma.statement.findMany({
        where: { patientId: patient.id, status: { not: "voided" } },
        orderBy: { createdAt: "desc" },
        take: 24,
      }),
      prisma.storedPaymentMethod.findMany({
        where: { patientId: patient.id, active: true },
        orderBy: { isDefault: "desc" },
      }),
      prisma.paymentPlan.findFirst({
        where: { patientId: patient.id, status: "active" },
      }),
      prisma.payment.findMany({
        where: {
          claim: { patientId: patient.id },
          source: "patient",
        },
        include: { claim: { select: { serviceDate: true } } },
        orderBy: { paymentDate: "desc" },
        take: 6,
      }),
    ]);

  const totalDue = statements.reduce(
    (sum, s) => sum + Math.max(0, s.amountDueCents - s.paidToDateCents),
    0,
  );
  const overdueCount = statements.filter((s) => s.status === "overdue").length;
  const defaultMethod = paymentMethods[0] ?? null;

  return (
    <PageShell maxWidth="max-w-[920px]">
      <PageHeader
        eyebrow="Billing"
        title="Your statements"
        description="Every bill we've sent you, with a plain-language summary of what insurance covered and why you owe what's left."
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

      {/* Header summary */}
      <Card tone="ambient" className="mb-8">
        <CardContent className="py-8 grid md:grid-cols-3 gap-6">
          <div>
            <Eyebrow className="mb-2">Total balance</Eyebrow>
            <p className="font-display text-4xl text-text tabular-nums">
              {formatMoney(totalDue)}
            </p>
            {overdueCount > 0 && (
              <p className="text-xs text-danger mt-2">
                {overdueCount} statement{overdueCount > 1 ? "s" : ""} past due
              </p>
            )}
          </div>
          <div>
            <Eyebrow className="mb-2">Statements</Eyebrow>
            <p className="font-display text-4xl text-text tabular-nums">
              {statements.length}
            </p>
            <p className="text-xs text-text-muted mt-2">on file</p>
          </div>
          <div className="flex flex-col justify-center gap-2">
            {totalDue > 0 ? (
              <>
                <Button size="lg" disabled>Pay {formatMoney(totalDue)}</Button>
                {!paymentPlan && (
                  <Button variant="secondary" size="sm" disabled>
                    Set up a payment plan
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-success font-medium">
                All caught up — thanks for staying current.
              </p>
            )}
            {defaultMethod && (
              <p className="text-[11px] text-text-subtle">
                Default: {defaultMethod.brand ?? "Card"} •{defaultMethod.last4}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Statements feed */}
      {statements.length === 0 ? (
        <EmptyState
          title="No statements yet"
          description="When you receive a bill it will show up here. We always include a plain-language explanation so you know exactly what you're paying for."
        />
      ) : (
        <div className="space-y-6">
          {statements.map((statement) => (
            <StatementCard key={statement.id} statement={statement} />
          ))}
        </div>
      )}

      <EditorialRule className="my-12" />

      {/* Recent payments */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Recent payments</Eyebrow>
        {recentPayments.length === 0 ? (
          <p className="text-sm text-text-subtle">
            We don&apos;t have any payments on file yet.
          </p>
        ) : (
          <Card tone="raised">
            <CardContent className="py-4">
              <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[26rem]">
                <thead>
                  <tr className="text-left text-text-subtle text-[11px] uppercase tracking-wider border-b border-border/60">
                    <th className="py-2">Date</th>
                    <th className="py-2">Service</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2 text-right">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/30 last:border-0"
                    >
                      <td className="py-2 text-text">
                        {formatDate(p.paymentDate)}
                      </td>
                      <td className="py-2 text-text-muted">
                        {p.claim?.serviceDate
                          ? formatDate(p.claim.serviceDate)
                          : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-success">
                        {formatMoney(p.amountCents)}
                      </td>
                      <td className="py-2 text-right text-[11px] text-text-subtle">
                        {p.reference ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Help footer */}
      <Card tone="raised" className="mb-12">
        <CardContent className="py-6">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <LeafSprig size={20} className="text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-text">
                Questions about a statement?
              </p>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Tap &quot;Questions?&quot; on any statement and our billing
                team will explain it in plain language. We&apos;ll never let
                you guess what you&apos;re paying for.
              </p>
              <div className="mt-3">
                <Link href="/portal/billing">
                  <Button variant="ghost" size="sm">
                    Back to billing overview
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Statement card — uses the EOB display layer when the statement was
// generated from an ERA so the patient sees the AI plain-language summary
// alongside a deterministic insurance breakdown.
// ---------------------------------------------------------------------------

function StatementCard({
  statement,
}: {
  statement: {
    id: string;
    statementNumber: string;
    periodStart: Date;
    periodEnd: Date;
    dueDate: Date;
    totalChargesCents: number;
    insurancePaidCents: number;
    adjustmentsCents: number;
    amountDueCents: number;
    paidToDateCents: number;
    status: string;
    plainLanguageSummary: string | null;
    lineItems: unknown;
  };
}) {
  const remaining = statement.amountDueCents - statement.paidToDateCents;
  const lines = parseLineItems(statement.lineItems);
  const eobView = lines
    ? buildPatientView({
        eob: synthesizeParsedEob(statement, lines),
        aiSummary: statement.plainLanguageSummary ?? undefined,
      })
    : null;

  const tone =
    statement.status === "paid"
      ? "success"
      : statement.status === "overdue"
        ? "danger"
        : "warning";

  return (
    <Card tone="raised">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              {statement.statementNumber}
            </CardTitle>
            <CardDescription>
              For {formatDate(statement.periodStart)} —{" "}
              {formatDate(statement.periodEnd)}
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl text-text tabular-nums">
              {formatMoney(remaining)}
            </p>
            <Badge tone={tone} className="text-[10px] mt-1">
              {statement.status === "paid"
                ? "Paid"
                : `Due ${formatDate(statement.dueDate)}`}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Plain-language summary */}
        {(eobView?.plainLanguageSummary || statement.plainLanguageSummary) && (
          <div className="p-4 rounded-lg bg-accent/[0.04] border border-accent/15 mb-5">
            <div className="flex items-start gap-2">
              <LeafSprig
                size={14}
                className="text-accent mt-0.5 shrink-0"
              />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-accent mb-1">
                  In plain language
                </p>
                <p className="text-sm text-text leading-relaxed">
                  {eobView?.plainLanguageSummary ??
                    statement.plainLanguageSummary}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Insurance summary */}
        <div className="space-y-2 text-sm mb-5">
          <div className="flex justify-between text-text-muted">
            <span>Total billed</span>
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
              <span>Plan discount</span>
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
            <div className="flex justify-between text-success text-xs">
              <span>Already paid</span>
              <span className="tabular-nums">
                {formatMoney(statement.paidToDateCents)}
              </span>
            </div>
          )}
        </div>

        {/* Why you owe — patient categories */}
        {eobView && eobView.breakdown.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-subtle mb-2">
              Why you owe this
            </p>
            <div className="space-y-2">
              {eobView.breakdown.map((row) => (
                <div
                  key={row.category}
                  className="rounded-lg bg-surface-muted/50 border border-border/40 p-3"
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-sm font-medium text-text">
                      {row.label}
                    </span>
                    <span className="text-sm tabular-nums text-text">
                      {formatMoney(row.amountCents)}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    {row.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {statement.status !== "paid" && remaining > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled>Pay {formatMoney(remaining)}</Button>
            <Link href="/portal/billing/disputes">
              <Button variant="secondary" size="sm">
                Something looks wrong
              </Button>
            </Link>
            <Button variant="ghost" size="sm" disabled>
              Download PDF
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers — adapt the Statement.lineItems JSON into the ParsedEob shape
// the eob-display layer expects. Statements without ERA-derived lines fall
// back to no eobView (the plain-language summary on the row is still shown).
// ---------------------------------------------------------------------------

interface StatementLineItem {
  description: string;
  amountCents: number;
  cptCode?: string;
  encounterId?: string;
}

function parseLineItems(raw: unknown): StatementLineItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: StatementLineItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    if (typeof rec.amountCents !== "number") continue;
    out.push({
      description: typeof rec.description === "string" ? rec.description : "Service",
      amountCents: rec.amountCents,
      cptCode: typeof rec.cptCode === "string" ? rec.cptCode : undefined,
      encounterId:
        typeof rec.encounterId === "string" ? rec.encounterId : undefined,
    });
  }
  return out.length > 0 ? out : null;
}

function synthesizeParsedEob(
  statement: {
    insurancePaidCents: number;
    totalChargesCents: number;
    adjustmentsCents: number;
    amountDueCents: number;
    periodEnd: Date;
  },
  lineItems: StatementLineItem[],
): ReturnType<typeof buildEobFromEra835> {
  // Build an internal ParsedEob shape from the statement so the
  // eob-display layer can produce the patient view. Patient resp is
  // attributed to a single CARC-1 (deductible-style) row when the
  // statement doesn't carry remit detail; the plain-language summary
  // takes over for the actual narrative.
  const cptLines = lineItems.map((line) => {
    const billed = Math.max(0, line.amountCents);
    return {
      cptCode: line.cptCode ?? "—",
      description: line.description,
      billedCents: billed,
      allowedCents: billed,
      paidCents: 0,
      adjustments: [
        {
          groupCode: "PR" as const,
          carc: "1",
          amountCents: 0,
          rarc: undefined,
        },
      ],
    };
  });
  return buildEobFromEra835(
    {
      payerName: "Your insurance",
      paidDate: statement.periodEnd.toISOString().slice(0, 10),
      checkOrEftNumber: null,
    },
    {
      payerClaimNumber: "",
      patientControlNumber: "",
      cptLines,
    },
    null,
  );
}
