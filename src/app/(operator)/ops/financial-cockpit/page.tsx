import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Financial Cockpit" };
export const dynamic = "force-dynamic";

// EMR-178 — Financial Cockpit consolidates AR, claims, denials, and
// dispensary revenue into one page. Deep links from the old per-area
// surfaces redirect here. The cockpit is a thin landing page that pulls
// the headline metrics and routes to the existing detail surfaces.

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function FinancialCockpitPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const [statusCounts, recent30Days, dispensaryAgg, openDenials] = await Promise.all([
    prisma.claim.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: true,
      _sum: { billedAmountCents: true, paidAmountCents: true },
    }),
    prisma.claim.aggregate({
      where: {
        organizationId: orgId,
        serviceDate: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
      _count: true,
      _sum: { billedAmountCents: true, paidAmountCents: true },
    }),
    prisma.order.aggregate({
      where: {
        organizationId: orgId,
        createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
        status: { in: ["confirmed", "processing", "shipped", "delivered"] },
      },
      _count: true,
      _sum: { total: true, tax: true },
    }),
    prisma.claim.count({
      where: { organizationId: orgId, status: { in: ["denied", "appealed"] } },
    }),
  ]);

  const totalBilled = statusCounts.reduce(
    (a, s) => a + (s._sum.billedAmountCents ?? 0),
    0,
  );
  const totalPaid = statusCounts.reduce(
    (a, s) => a + (s._sum.paidAmountCents ?? 0),
    0,
  );
  const collectionRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
  const dispensaryGrossCents = (dispensaryAgg._sum.total ?? 0) * 100; // Order.total is decimal dollars
  const dispensaryTaxCents = (dispensaryAgg._sum.tax ?? 0) * 100;

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Financial Cockpit"
        title="Money command center"
        description="One landing page for AR, claims, denials, dispensary revenue, and the daily close. Drill into any tile for the full surface."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/ops/financial-cockpit/ai-rcm">
              <Button variant="secondary" size="sm">
                AI RCM dashboard
              </Button>
            </Link>
            <Link href="/ops/revenue">
              <Button variant="secondary" size="sm">
                Revenue cockpit
              </Button>
            </Link>
            <Link href="/ops/billing">
              <Button variant="primary" size="sm">
                Billing workqueue
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <KpiTile
          label="Total billed (all-time)"
          value={formatMoney(totalBilled)}
          hint={`${statusCounts.reduce((a, s) => a + s._count, 0)} claims`}
        />
        <KpiTile
          label="Collected"
          value={formatMoney(totalPaid)}
          hint={`${collectionRate}% collection rate`}
          tone="success"
        />
        <KpiTile
          label="Last 30 days billed"
          value={formatMoney(recent30Days._sum.billedAmountCents ?? 0)}
          hint={`${recent30Days._count} claims · ${formatMoney(recent30Days._sum.paidAmountCents ?? 0)} collected`}
          tone="accent"
        />
        <KpiTile
          label="Dispensary (30d)"
          value={formatMoney(dispensaryGrossCents)}
          hint={`${dispensaryAgg._count} orders · ${formatMoney(dispensaryTaxCents)} tax`}
        />
      </div>

      <EditorialRule className="my-8" />

      <Eyebrow className="mb-4">Drill-downs</Eyebrow>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        <DrilldownCard
          href="/ops/financial-cockpit/ai-rcm"
          title="AI RCM dashboard"
          description="Benchmark our AI revenue cycle against Epic, Athena, R1 RCM, and Optum. Clean-claim, A/R, denials — every metric, side-by-side."
          badge="New"
          badgeTone="accent"
        />
        <DrilldownCard
          href="/ops/revenue"
          title="Revenue cockpit"
          description="Full revenue funnel, AR aging, denial queue, payer mix, dispensary gross/net."
        />
        <DrilldownCard
          href="/ops/billing"
          title="Billing workqueue"
          description="Per-claim status, scrub blocks, appeal in-flight, code edits."
          badge={openDenials > 0 ? `${openDenials} open denials` : undefined}
          badgeTone={openDenials > 0 ? "danger" : undefined}
        />
        <DrilldownCard
          href="/ops/aging"
          title="AR aging"
          description="Bucketed receivables (0-30, 31-60, 61-90, 90+) with worklist routing."
        />
        <DrilldownCard
          href="/ops/denials"
          title="Denials"
          description="CARC-grouped denials with appeal automation and outcome tracker."
        />
        <DrilldownCard
          href="/ops/eob"
          title="EOB / ERA"
          description="Posted remits, lockbox uploads, secondary-claim spawn."
        />
        <DrilldownCard
          href="/ops/dispensary-reimbursement"
          title="Dispensary reimbursement"
          description="$500 cannabis cap tracker — patient-by-patient YTD + monthly statements."
        />
        <DrilldownCard
          href="/ops/cfo"
          title="CFO desk"
          description="P&L, balance sheet, cash flow, KPI deltas — board-grade reporting."
        />
        <DrilldownCard
          href="/ops/pricing"
          title="Pricing & ROI"
          description="Tier comparison vs EPIC / Cerner / athenahealth + ROI calculator."
        />
        <DrilldownCard
          href="/ops/international-billing"
          title="International billing"
          description="Multi-country claim adapters, FX rates, multi-currency ledger."
        />
      </div>

      <Card tone="outlined">
        <CardContent className="pt-4 pb-4 text-xs text-text-muted leading-relaxed">
          <p>
            <strong>Heads up:</strong> the old <code>/clinic/billing</code> tab now redirects
            here so there's a single source of truth for revenue. Billing-related deep links
            from charts, statements, and morning brief continue to land on their detail
            surface — this page just collects the entry points.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function KpiTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "accent";
}) {
  const toneClass =
    tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : "text-text";
  return (
    <Card tone="raised">
      <CardContent className="pt-6 pb-6">
        <p className="text-xs text-text-subtle uppercase tracking-wider">{label}</p>
        <p className={`font-display text-3xl tabular-nums mt-1 ${toneClass}`}>{value}</p>
        {hint && <p className="text-[11px] text-text-subtle mt-2">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function DrilldownCard({
  href,
  title,
  description,
  badge,
  badgeTone,
}: {
  href: string;
  title: string;
  description: string;
  badge?: string;
  badgeTone?: "danger" | "warning" | "accent";
}) {
  return (
    <Link href={href}>
      <Card className="card-hover h-full">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            {title}
            {badge && <Badge tone={badgeTone ?? "neutral"}>{badge}</Badge>}
          </CardTitle>
          <CardDescription className="leading-relaxed">{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
