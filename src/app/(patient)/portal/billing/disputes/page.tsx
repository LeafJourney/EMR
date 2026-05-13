// EMR-068 — Patient billing portal: dispute filing + history.
//
// Lets a patient flag any statement they disagree with, file a
// dispute with one of the canned reasons, and watch the plain-language
// status update as the billing team works it. The AI draft is hidden
// from the patient (it's billing-internal); the patient sees only the
// state machine + their narrative + any human-written resolution note.

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
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
import { formatDate, formatRelative } from "@/lib/utils/format";
import { formatMoney } from "@/lib/domain/billing";
import {
  isTerminal,
  listReasonOptions,
  patientStatusCopy,
  reasonLabel,
  type DisputeStatus,
} from "@/lib/billing/dispute";
import { fileDispute, withdrawDispute } from "./actions";

export const metadata = { title: "Billing disputes" };

export default async function PatientDisputesPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) redirect("/portal/intake");

  const [disputes, eligibleStatements] = await Promise.all([
    prisma.statementDispute.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        statement: {
          select: { statementNumber: true, amountDueCents: true, periodEnd: true },
        },
      },
    }),
    prisma.statement.findMany({
      where: {
        patientId: patient.id,
        status: { notIn: ["voided", "paid"] },
      },
      select: {
        id: true,
        statementNumber: true,
        amountDueCents: true,
        periodEnd: true,
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  return (
    <PageShell maxWidth="max-w-[920px]">
      <PageHeader
        eyebrow="Billing"
        title="Disputes"
        description="If a statement looks wrong, tell us. We'll review it within 3–5 business days and update you in plain language."
      />

      <PatientSectionNav section="account" />

      <Card tone="raised" className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">File a new dispute</CardTitle>
          <CardDescription>
            Pick the statement you're disputing and the reason that fits best.
            We'll route it to the billing team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {eligibleStatements.length === 0 ? (
            <p className="text-sm text-text-subtle">
              You don't have any open statements to dispute right now.
            </p>
          ) : (
            <form action={fileDispute} className="space-y-3">
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-subtle">
                  Statement
                </label>
                <select
                  name="statementId"
                  required
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                >
                  {eligibleStatements.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.statementNumber} · {formatDate(s.periodEnd)} · {formatMoney(s.amountDueCents)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-subtle">
                  Reason
                </label>
                <select
                  name="reason"
                  required
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                >
                  {listReasonOptions().map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-subtle">
                  Amount you're disputing (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="disputedAmount"
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-wider text-text-subtle">
                  Tell us what's wrong
                </label>
                <textarea
                  name="narrative"
                  required
                  rows={4}
                  minLength={4}
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  placeholder="Walk us through what looks wrong..."
                />
              </div>
              <Button type="submit" variant="primary" size="sm">
                Submit dispute
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Your disputes</CardTitle>
          <CardDescription>
            We update the status here as the billing team works through it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {disputes.length === 0 ? (
            <EmptyState
              title="No disputes filed"
              description="If a statement ever looks wrong, you can file a dispute above."
            />
          ) : (
            disputes.map((d) => (
              <div
                key={d.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <p className="text-sm text-text font-medium">
                      {d.statement.statementNumber} ·{" "}
                      {formatDate(d.statement.periodEnd)}
                    </p>
                    <p className="text-[11px] text-text-subtle">
                      {reasonLabel(d.reason as never)} ·{" "}
                      {formatRelative(d.createdAt)}
                    </p>
                  </div>
                  <Badge tone={statusTone(d.status as DisputeStatus)}>
                    {readableStatus(d.status as DisputeStatus)}
                  </Badge>
                </div>
                <p className="text-sm text-text-muted leading-relaxed mb-2">
                  {patientStatusCopy(d.status as DisputeStatus)}
                </p>
                {d.disputedAmountCents != null && (
                  <p className="text-xs text-text-subtle">
                    Disputed amount: {formatMoney(d.disputedAmountCents)}
                  </p>
                )}
                {d.resolutionNote && (
                  <p className="text-sm text-text mt-3 p-3 rounded-md bg-accent/5 border border-accent/15">
                    {d.resolutionNote}
                  </p>
                )}
                {!isTerminal(d.status as DisputeStatus) && (
                  <form action={withdrawDispute} className="mt-3">
                    <input type="hidden" name="disputeId" value={d.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Withdraw dispute
                    </Button>
                  </form>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <Link href="/portal/billing/statements">
          <Button variant="ghost" size="sm">
            ← Back to statements
          </Button>
        </Link>
      </div>
    </PageShell>
  );
}

function statusTone(
  status: DisputeStatus,
):
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "info"
  | "highlight"
  | "accent" {
  switch (status) {
    case "submitted":
      return "info";
    case "under_review":
      return "warning";
    case "awaiting_patient":
      return "highlight";
    case "resolved_corrected":
      return "success";
    case "resolved_upheld":
      return "neutral";
    case "withdrawn":
      return "neutral";
  }
}

function readableStatus(status: DisputeStatus): string {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "under_review":
      return "Under review";
    case "awaiting_patient":
      return "Needs your input";
    case "resolved_corrected":
      return "Corrected";
    case "resolved_upheld":
      return "Upheld";
    case "withdrawn":
      return "Withdrawn";
  }
}
