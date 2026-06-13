import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/ornament";
import { formatMoney } from "@/lib/domain/billing";
import { formatDate } from "@/lib/utils/format";
import { DailyCloseTable, type DailyCloseRow } from "./daily-close-table";

export const metadata = { title: "RCM daily close" };

export default async function DailyClosePage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  const recent = await prisma.rcmDailyClose.findMany({
    where: { organizationId },
    orderBy: { closeDate: "desc" },
    take: 30,
  });
  const latest = recent[0] ?? null;
  const prior = recent[1] ?? null;

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Track 7 · Financial Ops"
        title="Daily RCM close"
        description="Single daily view of every dollar billed, allowed, paid, and outstanding. Generated at 23:59 local; emailed to the practice owner the next morning."
      />

      {!latest ? (
        <EmptyState
          title="No close runs yet"
          description="The daily-close job runs at 23:59 local and writes one row per day. The latest row appears here when ready."
        />
      ) : (
        <>
          <div className="mb-4">
            <Eyebrow>
              Latest close · {formatDate(latest.closeDate)}
              {latest.emailedAt && ` · emailed ${formatDate(latest.emailedAt)}`}
            </Eyebrow>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <DeltaCard label="Billed" value={formatMoney(latest.billedCents)} prior={prior?.billedCents} />
            <DeltaCard label="Allowed" value={formatMoney(latest.allowedCents)} prior={prior?.allowedCents} />
            <DeltaCard label="Paid" value={formatMoney(latest.paidCents)} prior={prior?.paidCents} tone="success" />
            <DeltaCard label="Patient resp" value={formatMoney(latest.patientRespCents)} prior={prior?.patientRespCents} tone="warning" />
          </div>

          <Card tone="raised" className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Activity counters</CardTitle>
              <CardDescription>Counts of claim transitions during the close window</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 md:grid-cols-8 gap-4">
                <CounterCell label="Created" value={latest.claimsCreated} />
                <CounterCell label="Submitted" value={latest.claimsSubmitted} />
                <CounterCell label="Accepted" value={latest.claimsAccepted} />
                <CounterCell label="Rejected" value={latest.claimsRejected} tone="warning" />
                <CounterCell label="Paid" value={latest.claimsPaid} tone="success" />
                <CounterCell label="Denied" value={latest.claimsDenied} tone="danger" />
                <CounterCell label="Appealed" value={latest.claimsAppealed} tone="accent" />
                <CounterCell label="Written off" value={latest.claimsWrittenOff} tone="neutral" />
              </div>
            </CardContent>
          </Card>

          <Card tone="raised" className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">A/R snapshot</CardTitle>
              <CardDescription>Outstanding receivables at close</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <CounterCell label="0–30" value={formatMoney(latest.arBucket0to30)} mono />
                <CounterCell label="31–60" value={formatMoney(latest.arBucket31to60)} mono />
                <CounterCell label="61–90" value={formatMoney(latest.arBucket61to90)} mono tone="warning" />
                <CounterCell label="91–120" value={formatMoney(latest.arBucket91to120)} mono tone="warning" />
                <CounterCell label="120+" value={formatMoney(latest.arBucket120plus)} mono tone="danger" />
                <CounterCell label="Total" value={formatMoney(latest.outstandingArCents)} mono />
              </div>
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Exception counters</CardTitle>
              <CardDescription>Items that need a human</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-4">
                <CounterCell label="Stale claims" value={latest.staleClaims} tone={latest.staleClaims > 0 ? "warning" : "success"} />
                <CounterCell label="Unbalanced batches" value={latest.unbalancedBatches} tone={latest.unbalancedBatches > 0 ? "danger" : "success"} />
                <CounterCell label="Pending takebacks" value={latest.pendingTakebacks} tone={latest.pendingTakebacks > 0 ? "warning" : "success"} />
                <CounterCell label="Unmatched deposits" value={latest.unmatchedDeposits} tone={latest.unmatchedDeposits > 0 ? "warning" : "success"} />
                <CounterCell label="Overdue appeals" value={latest.overdueAppeals} tone={latest.overdueAppeals > 0 ? "warning" : "success"} />
              </div>
            </CardContent>
          </Card>

          {recent.length > 1 && (() => {
            const historyRows: DailyCloseRow[] = recent.map((r) => ({
              id: r.id,
              dateDisplay: formatDate(r.closeDate),
              dateMs: r.closeDate.getTime(),
              billedDisplay: formatMoney(r.billedCents),
              billedCents: r.billedCents,
              paidDisplay: formatMoney(r.paidCents),
              paidCents: r.paidCents,
              arDisplay: formatMoney(r.outstandingArCents),
              arCents: r.outstandingArCents,
              stale: r.staleClaims,
              overdue: r.overdueAppeals,
            }));
            return (
              <>
                <div className="mt-10 mb-4">
                  <Eyebrow>Last 30 days</Eyebrow>
                </div>
                <DailyCloseTable rows={historyRows} />
              </>
            );
          })()}
        </>
      )}
    </PageShell>
  );
}

function DeltaCard({
  label,
  value,
  prior,
  tone = "neutral",
}: {
  label: string;
  value: string;
  prior?: number;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  const colors: Record<string, string> = { neutral: "text-text", success: "text-success", warning: "text-[color:var(--warning)]", danger: "text-danger", accent: "text-accent" };
  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <p className={`font-display text-2xl tabular-nums ${colors[tone]}`}>{value}</p>
        <p className="text-xs text-text-muted mt-1">{label}</p>
        {prior != null && (
          <p className="text-[10px] text-text-subtle mt-1">prior {formatMoney(prior)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function CounterCell({
  label,
  value,
  tone = "neutral",
  mono = false,
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  mono?: boolean;
}) {
  const colors: Record<string, string> = { neutral: "text-text", success: "text-success", warning: "text-[color:var(--warning)]", danger: "text-danger", accent: "text-accent" };
  return (
    <div>
      <p className={`${mono ? "font-display text-base" : "text-xl"} tabular-nums ${colors[tone]}`}>{value}</p>
      <p className="text-[11px] text-text-subtle mt-0.5">{label}</p>
    </div>
  );
}
