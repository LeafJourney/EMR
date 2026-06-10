import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/domain/billing";
import { resolvePaymentGateway } from "@/lib/payments";
import { aggregateOutstandingBalances } from "@/lib/domain/patient-balances";
import { CollectForm } from "./collect-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Patient Payments" };

const STATEMENT_OPEN = ["sent", "viewed", "partially_paid", "overdue"] as const;

/**
 * Front-desk patient payments (Back-Office Operations Audit §6.4, EMR-1078).
 * The "money in from the patient at the desk" surface the audit found missing
 * (only payer billing existed). Lists outstanding patient-responsibility
 * balances and lets staff collect against them — routed through the
 * provider-agnostic payment gateway (stub today; flips to Payabli when
 * PAYMENT_GATEWAY=payabli + keys are set). Open patient statements are shown
 * alongside. /ops/payments no longer 404s.
 */
export default async function PaymentsPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Revenue cycle"
          title="Patient payments"
          description="No practice is associated with your account."
        />
      </PageShell>
    );
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [claims, todayEvents, statements] = await Promise.all([
    prisma.claim.findMany({
      where: {
        organizationId: orgId,
        patientRespCents: { gt: 0 },
        status: { in: ["accepted", "adjudicated", "partial", "paid"] },
      },
      select: {
        patientId: true,
        patientRespCents: true,
        patient: { select: { firstName: true, lastName: true } },
        payments: { select: { source: true, amountCents: true } },
      },
    }),
    prisma.financialEvent.findMany({
      where: {
        organizationId: orgId,
        type: { in: ["patient_payment", "copay_collected"] },
        occurredAt: { gte: startOfToday },
      },
      select: { amountCents: true },
    }),
    prisma.statement.findMany({
      where: { organizationId: orgId, status: { in: [...STATEMENT_OPEN] } },
      orderBy: { dueDate: "asc" },
      take: 50,
      select: {
        id: true,
        amountDueCents: true,
        paidToDateCents: true,
        status: true,
        dueDate: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  const balances = aggregateOutstandingBalances(
    claims.map((c) => ({
      patientId: c.patientId,
      patientFirstName: c.patient.firstName,
      patientLastName: c.patient.lastName,
      patientRespCents: c.patientRespCents,
      payments: c.payments,
    })),
  );

  const todayCollectedCents = todayEvents.reduce((s, e) => s + e.amountCents, 0);
  const gatewayName = resolvePaymentGateway().name;
  const liveProcessor = gatewayName.toLowerCase() !== "stub";

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Revenue cycle"
        title="Patient payments"
        description="Collect copays and balances at the desk. The payer side is handled in Billing; this is the patient's side."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Collected today" value={formatMoney(todayCollectedCents)} tone="success" />
        <StatCard label="Patients with a balance" value={String(balances.length)} />
        <StatCard label="Open statements" value={String(statements.length)} tone="muted" />
      </div>

      {/* Processor status — so staff know whether a real charge will fire. */}
      <div className="mb-8">
        <Badge tone={liveProcessor ? "success" : "warning"}>
          {liveProcessor
            ? `Live processor: ${gatewayName}`
            : "Demo mode — payments are recorded but no card is charged (processor not yet enabled)"}
        </Badge>
      </div>

      <section className="mb-12">
        <h2 className="font-display text-lg text-text mb-3">Outstanding balances</h2>
        {balances.length === 0 ? (
          <EmptyState
            title="No outstanding patient balances"
            description="When a claim leaves patient responsibility, it shows up here to collect."
          />
        ) : (
          <div className="space-y-2">
            {balances.map((b) => (
              <div
                key={b.patientId}
                className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium text-text">{b.patientName}</p>
                  <p className="text-sm text-text-muted">
                    Patient owes{" "}
                    <span className="font-medium text-text tabular-nums">
                      {formatMoney(b.owedCents)}
                    </span>
                  </p>
                </div>
                <CollectForm
                  patientId={b.patientId}
                  defaultAmountCents={b.owedCents}
                  liveProcessor={liveProcessor}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg text-text mb-3">Open statements</h2>
        {statements.length === 0 ? (
          <EmptyState
            title="No open statements"
            description="Patient statements awaiting payment will appear here."
          />
        ) : (
          <div className="space-y-2">
            {statements.map((s) => {
              const remaining = s.amountDueCents - s.paidToDateCents;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-text">
                      {s.patient.firstName} {s.patient.lastName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-subtle">
                      <Badge tone={s.status === "overdue" ? "danger" : "neutral"}>
                        {s.status.replace(/_/g, " ")}
                      </Badge>
                      {s.dueDate && (
                        <span>
                          Due{" "}
                          {s.dueDate.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="shrink-0 font-medium text-text tabular-nums">
                    {formatMoney(remaining)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "muted";
}) {
  const colors = {
    neutral: "text-text",
    success: "text-success",
    muted: "text-text-muted",
  };
  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <p className={`font-display text-2xl tabular-nums ${colors[tone]}`}>{value}</p>
        <p className="text-xs text-text-muted mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
