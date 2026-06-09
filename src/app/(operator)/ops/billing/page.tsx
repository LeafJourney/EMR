import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils/format";
import { BillingKpiCards, type BillingKpi } from "./kpi-cards";
import { BillingWorkspace } from "./billing-workspace";
import { type StatusKey } from "./status-ribbon";
import { type SerializedClaim } from "./billing-table";

export const metadata = { title: "Billing Dashboard" };

const STATUS_KEYS: StatusKey[] = [
  "all",
  "draft",
  "submitted",
  "accepted",
  "adjudicated",
  "paid",
  "partial",
  "denied",
  "closed",
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const user = await requireUser();
  const organizationId = user.organizationId!;
  // EMR-953 — filtering is now client-side, so load all statuses once and let
  // the StatusRibbon filter the loaded rows instantly. ?status= only seeds the
  // initial chip selection (preserves deep-links like "View denials").
  const initialStatus: StatusKey = STATUS_KEYS.includes(
    searchParams.status as StatusKey,
  )
    ? (searchParams.status as StatusKey)
    : "all";

  const [claims, statusCounts] = await Promise.all([
    prisma.claim.findMany({
      where: { organizationId },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        provider: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        // EMR-973 — relations for the denial audit/history trail.
        denialEvents: { orderBy: { createdAt: "asc" } },
        appealPackets: {
          orderBy: { createdAt: "asc" },
          include: { outcome: { select: { result: true } } },
        },
        submissions: { orderBy: { submittedAt: "asc" } },
        adjudications: { orderBy: { eraDate: "asc" } },
      },
      orderBy: { serviceDate: "desc" },
      take: 200,
    }),
    prisma.claim.groupBy({
      by: ["status"],
      where: { organizationId },
      _count: true,
      _sum: {
        billedAmountCents: true,
        paidAmountCents: true,
      },
    }),
  ]);

  // EMR-933 — primary-coverage eligibility per patient, for inline row badges.
  const patientIds = [...new Set(claims.map((c) => c.patient.id))];
  const coverages = await prisma.patientCoverage.findMany({
    where: { patientId: { in: patientIds }, type: "primary", active: true },
    select: { patientId: true, eligibilityStatus: true },
  });
  const eligibilityByPatient = new Map(
    coverages.map((c) => [c.patientId, c.eligibilityStatus]),
  );

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count]),
  );
  const totalCount = statusCounts.reduce((acc, s) => acc + s._count, 0);

  // Totals for the KPI strip
  const totalBilled = statusCounts.reduce(
    (acc, s) => acc + (s._sum.billedAmountCents ?? 0),
    0,
  );
  const totalPaid = statusCounts.reduce(
    (acc, s) => acc + (s._sum.paidAmountCents ?? 0),
    0,
  );
  const outstandingCents = totalBilled - totalPaid;
  const denialCount = countByStatus.denied ?? 0;
  const pendingRevenueCents = statusCounts
    .filter((s) => s.status === "accepted" || s.status === "adjudicated" || s.status === "submitted")
    .reduce((acc, s) => acc + (s._sum.billedAmountCents ?? 0), 0);

  // Serialize to plain rows for the client table — Dates → ISO strings,
  // cents are already Ints. Never pass Prisma Date/Decimal objects across
  // the server/client boundary.
  const serializedClaims: SerializedClaim[] = claims.map((claim) => ({
    id: claim.id,
    status: claim.status,
    patient: {
      id: claim.patient.id,
      firstName: claim.patient.firstName,
      lastName: claim.patient.lastName,
    },
    serviceDate: claim.serviceDate.toISOString(),
    cptCodes: (claim.cptCodes as Array<{ code: string; label?: string }>) ?? [],
    icd10Codes: (claim.icd10Codes as Array<{ code: string }>) ?? [],
    payerName: claim.payerName,
    billedAmountCents: claim.billedAmountCents,
    paidAmountCents: claim.paidAmountCents,
    allowedAmountCents: claim.allowedAmountCents,
    patientRespCents: claim.patientRespCents,
    eligibilityStatus: eligibilityByPatient.get(claim.patient.id) ?? null,
    denialReason: claim.denialReason,
    deniedAt: claim.deniedAt ? claim.deniedAt.toISOString() : null,
    denialEvents: claim.denialEvents.map((d) => ({
      id: d.id,
      carcCode: d.carcCode,
      rarcCode: d.rarcCode,
      groupCode: d.groupCode,
      denialCategory: d.denialCategory,
      amountDeniedCents: d.amountDeniedCents,
      recoverable: d.recoverable,
      recoverableAmountCents: d.recoverableAmountCents,
      resolution: d.resolution,
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
    })),
    appealPackets: claim.appealPackets.map((p) => ({
      id: p.id,
      appealLevel: p.appealLevel,
      status: p.status,
      submittedAt: p.submittedAt ? p.submittedAt.toISOString() : null,
      submittedTo: p.submittedTo,
      outcomeReceivedAt: p.outcomeReceivedAt ? p.outcomeReceivedAt.toISOString() : null,
      reviewedBy: p.reviewedBy,
      createdAt: p.createdAt.toISOString(),
      outcomeDecision: p.outcome ? p.outcome.result : null,
    })),
    submissions: claim.submissions.map((s) => ({
      id: s.id,
      clearinghouseName: s.clearinghouseName,
      responseStatus: s.responseStatus,
      responseCode: s.responseCode,
      responseMessage: s.responseMessage,
      submittedAt: s.submittedAt.toISOString(),
      respondedAt: s.respondedAt ? s.respondedAt.toISOString() : null,
      retryCount: s.retryCount,
    })),
    adjudications: claim.adjudications.map((a) => ({
      id: a.id,
      claimStatus: a.claimStatus,
      checkNumber: a.checkNumber,
      totalPaidCents: a.totalPaidCents,
      totalAllowedCents: a.totalAllowedCents,
      totalAdjustedCents: a.totalAdjustedCents,
      totalPatientRespCents: a.totalPatientRespCents,
      eraDate: a.eraDate.toISOString(),
      parsedAt: a.parsedAt.toISOString(),
    })),
  }));

  // EMR-945 / EMR-937 — KPI tiles with larger hint text + LeafNerd drilldown.
  const kpis: BillingKpi[] = [
    {
      key: "totalBilled",
      label: "Total billed",
      value: formatMoney(totalBilled),
      hint: `${totalCount} claims`,
      currentValue: totalBilled,
      format: "money",
    },
    {
      key: "collected",
      label: "Collected",
      value: formatMoney(totalPaid),
      tone: "success",
      hint: `${totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0}% of billed`,
      currentValue: totalPaid,
      format: "money",
    },
    {
      key: "pendingRevenue",
      label: "Pending revenue",
      value: formatMoney(pendingRevenueCents),
      tone: "accent",
      // EMR-945 — copy fix: "in process" → "in progress".
      hint: "Submitted or in progress",
      currentValue: pendingRevenueCents,
      format: "money",
    },
    {
      key: "outstanding",
      label: "Outstanding",
      value: formatMoney(outstandingCents),
      tone: "warning",
      hint: denialCount > 0 ? `${denialCount} denials need action` : "No denials",
      currentValue: outstandingCents,
      format: "money",
    },
  ];

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Practice management"
        title="Billing Dashboard"
        description="All claims across the practice — filter by status, review denials, and submit drafts."
      />

      {/* KPI tiles (EMR-945 enlarged hints, EMR-937 clickable LeafNerd drilldown) */}
      <BillingKpiCards kpis={kpis} />

      {/* Status ribbon + claims table (EMR-953 client-side filtering) */}
      <BillingWorkspace
        claims={serializedClaims}
        counts={countByStatus}
        totalCount={totalCount}
        initialStatus={initialStatus}
      />

      {/* Denials alert */}
      {denialCount > 0 && initialStatus === "all" && (
        <Card tone="raised" className="mt-8 border-l-4 border-l-danger">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span>⚠️</span>
              {denialCount} denied claim{denialCount !== 1 ? "s" : ""} need
              attention
            </CardTitle>
            <CardDescription>
              Review denial reasons, correct the coding or documentation, and
              resubmit or appeal within the payer&apos;s window.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/ops/billing?status=denied"
              className="inline-flex items-center gap-2 text-sm font-medium text-danger hover:text-danger/80 transition-colors"
            >
              View denials &rarr;
            </Link>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
