import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { formatMoney } from "@/lib/domain/billing";
import {
  classifyDenial,
  NEXT_ACTION_LABEL,
  type DenialCategory,
} from "@/lib/billing/denials";
import { DenialCard, type TimelineEntry } from "./denials-client";

export const metadata = { title: "Denials Command Center" };

const URGENCY_TONE: Record<string, "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DenialsPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const user = await requireUser();
  const organizationId = user.organizationId!;
  const activeCategory = searchParams.category ?? "all";

  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      status: { in: ["denied", "appealed"] },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      // EMR-985 — relations powering the per-claim audit timeline.
      denialEvents: {
        select: {
          id: true,
          resolution: true,
          resolvedAt: true,
          createdAt: true,
          carcCode: true,
        },
      },
      appealPackets: {
        select: {
          id: true,
          appealLevel: true,
          status: true,
          submittedAt: true,
          outcomeReceivedAt: true,
          createdAt: true,
        },
      },
      appealOutcomes: {
        select: {
          id: true,
          result: true,
          decisionDate: true,
          recoveredCents: true,
          createdAt: true,
        },
      },
      adjustments: {
        select: {
          id: true,
          type: true,
          amountCents: true,
          postedAt: true,
          createdAt: true,
        },
      },
      submissions: {
        select: {
          id: true,
          clearinghouseName: true,
          submittedAt: true,
          responseStatus: true,
          isSecondary: true,
        },
      },
    },
    orderBy: { deniedAt: "desc" },
    take: 100,
  });

  // Classify each denial + build a serialized audit timeline per claim.
  const triaged = claims.map((claim) => ({
    claim,
    triage: classifyDenial(claim.denialReason),
    timeline: buildTimeline(claim),
  }));

  // Filter by category if active
  const filtered =
    activeCategory === "all"
      ? triaged
      : triaged.filter((t) => t.triage.category === activeCategory);

  // Stats by category
  const categoryCounts: Record<string, number> = {};
  const categoryDollars: Record<string, number> = {};
  for (const t of triaged) {
    categoryCounts[t.triage.category] = (categoryCounts[t.triage.category] ?? 0) + 1;
    categoryDollars[t.triage.category] =
      (categoryDollars[t.triage.category] ?? 0) + t.claim.billedAmountCents;
  }

  // Top categories sorted by count
  const sortedCategories = Object.entries(categoryCounts).sort(
    ([, a], [, b]) => b - a,
  );

  // Hero stats
  const totalDenials = triaged.length;
  const totalDollars = triaged.reduce(
    (acc, t) => acc + t.claim.billedAmountCents,
    0,
  );
  const highUrgencyCount = triaged.filter(
    (t) => t.triage.urgency === "high",
  ).length;

  // Payer denial mix
  const payerCounts: Record<string, number> = {};
  for (const t of triaged) {
    if (t.claim.payerName) {
      payerCounts[t.claim.payerName] =
        (payerCounts[t.claim.payerName] ?? 0) + 1;
    }
  }
  const topPayers = Object.entries(payerCounts).sort(([, a], [, b]) => b - a);

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Practice management"
        title="Denials command center"
        description="Every denied claim, classified and routed to a next action. Work the worklist top-down — the urgent ones are surfaced first."
      />

      {/* Hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Open denials"
          value={totalDenials.toString()}
          tone={totalDenials > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label="High urgency"
          value={highUrgencyCount.toString()}
          tone={highUrgencyCount > 0 ? "danger" : "success"}
        />
        <StatCard
          label="Total at risk"
          value={formatMoney(totalDollars)}
          tone="warning"
        />
        <StatCard
          label="Recovery target"
          value={formatMoney(Math.round(totalDollars * 0.6))}
          tone="accent"
          hint="60% baseline recovery rate"
        />
      </div>

      {/* Top categories */}
      {sortedCategories.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Denial root causes</CardTitle>
              <CardDescription>
                Trends by category. Fix upstream and these stop coming back.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sortedCategories.map(([category, count]) => {
                  const dollars = categoryDollars[category] ?? 0;
                  const pct = totalDenials > 0 ? Math.round((count / totalDenials) * 100) : 0;
                  return (
                    <div key={category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-text capitalize">
                          {category.replace(/_/g, " ")}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-muted tabular-nums">
                            {formatMoney(dollars)}
                          </span>
                          <Badge tone="warning" className="text-[10px]">
                            {count}
                          </Badge>
                        </div>
                      </div>
                      <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-danger rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Denial mix by payer</CardTitle>
              <CardDescription>
                Who&apos;s denying you the most.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {topPayers.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-4">
                  No payer data yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {topPayers.map(([payer, count]) => (
                    <div
                      key={payer}
                      className="flex items-center justify-between"
                    >
                      <span className="text-sm text-text">{payer}</span>
                      <Badge tone="warning">{count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <EditorialRule className="my-8" />

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <FilterTab
          label="All denials"
          count={totalDenials}
          active={activeCategory === "all"}
          href="/ops/denials"
        />
        {sortedCategories.map(([category, count]) => (
          <FilterTab
            key={category}
            label={category.replace(/_/g, " ")}
            count={count}
            active={activeCategory === category}
            href={`/ops/denials?category=${category}`}
          />
        ))}
      </div>

      {/* Worklist */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No denials in this view"
          description="When payers deny claims, they'll show up here classified and ready to work."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(({ claim, triage, timeline }) => (
            <DenialCard
              key={claim.id}
              urgency={triage.urgency}
              urgencyTone={URGENCY_TONE[triage.urgency]}
              patientId={claim.patient.id}
              patientFirstName={claim.patient.firstName}
              patientLastName={claim.patient.lastName}
              serviceDateLabel={formatDate(claim.serviceDate)}
              payerName={claim.payerName}
              claimNumber={claim.claimNumber}
              deniedRelative={
                claim.deniedAt ? formatRelative(claim.deniedAt) : null
              }
              billedLabel={formatMoney(claim.billedAmountCents)}
              triageLabel={triage.label}
              triageCategory={triage.category}
              triageDescription={triage.description}
              denialReason={claim.denialReason}
              suggestedActionLabel={NEXT_ACTION_LABEL[triage.suggestedAction]}
              timeline={timeline}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Timeline builder (EMR-985)
// ---------------------------------------------------------------------------

// Shape of the relations we select for the audit timeline. Kept local so the
// builder is decoupled from the full Prisma payload type.
type TimelineClaim = {
  deniedAt: Date | null;
  closedAt: Date | null;
  closureType: string | null;
  denialEvents: {
    resolution: string;
    resolvedAt: Date | null;
    createdAt: Date;
    carcCode: string;
  }[];
  appealPackets: {
    appealLevel: number;
    status: string;
    submittedAt: Date | null;
    outcomeReceivedAt: Date | null;
    createdAt: Date;
  }[];
  appealOutcomes: {
    result: string;
    decisionDate: Date | null;
    recoveredCents: number;
    createdAt: Date;
  }[];
  adjustments: {
    type: string;
    amountCents: number;
    postedAt: Date | null;
    createdAt: Date;
  }[];
  submissions: {
    clearinghouseName: string;
    submittedAt: Date;
    isSecondary: boolean;
  }[];
};

const DENIAL_RESOLUTION_LABEL: Record<string, string> = {
  pending: "Denial under review",
  corrected_and_resubmitted: "Corrected and resubmitted",
  appealed: "Appeal filed",
  written_off: "Written off",
  patient_responsibility: "Moved to patient responsibility",
  overturned: "Denial overturned — resolved",
  escalated: "Escalated for review",
};

const APPEAL_OUTCOME_LABEL: Record<string, string> = {
  pending: "Appeal decision pending",
  overturned: "Appeal overturned — denial reversed",
  upheld: "Appeal upheld — denial stands",
  partial: "Appeal partially overturned",
  withdrawn: "Appeal withdrawn",
  no_response: "Appeal — no payer response",
};

const ADJUSTMENT_TYPE_LABEL: Record<string, string> = {
  contractual: "Contractual adjustment posted",
  write_off: "Write-off posted",
  refund: "Refund posted",
  takeback: "Payer takeback posted",
  courtesy: "Courtesy adjustment posted",
};

// Build the per-claim audit trail: the denial anchor plus every dated step
// across submissions, appeals, outcomes, adjustments and denial-event
// resolutions, merged and sorted chronologically. All dates are serialized to
// ISO strings so the result is safe to pass to a client component.
function buildTimeline(claim: TimelineClaim): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // Anchor: the denial itself. Always present even if deniedAt is null so the
  // timeline never renders empty.
  entries.push({
    label: "Denied",
    date: claim.deniedAt ? claim.deniedAt.toISOString() : null,
    kind: "denied",
  });

  // Resubmissions to the clearinghouse.
  for (const s of claim.submissions) {
    entries.push({
      label: s.isSecondary
        ? `Secondary claim submitted to ${s.clearinghouseName}`
        : `Resubmitted to ${s.clearinghouseName}`,
      date: s.submittedAt.toISOString(),
      kind: "submission",
    });
  }

  // Appeal packets — sent + corrections received.
  for (const a of claim.appealPackets) {
    if (a.submittedAt) {
      entries.push({
        label: `Appeal sent (level ${a.appealLevel})`,
        date: a.submittedAt.toISOString(),
        kind: "appeal",
      });
    }
    if (a.outcomeReceivedAt) {
      entries.push({
        label: "Corrections from insurer received",
        date: a.outcomeReceivedAt.toISOString(),
        kind: "insurer",
      });
    }
  }

  // Appeal outcomes (decision dates).
  for (const o of claim.appealOutcomes) {
    const when = o.decisionDate ?? null;
    if (when) {
      entries.push({
        label: APPEAL_OUTCOME_LABEL[o.result] ?? `Appeal ${o.result}`,
        date: when.toISOString(),
        kind: o.result === "overturned" || o.result === "partial"
          ? "resolved"
          : "outcome",
      });
    }
  }

  // Adjustments posted to the ledger.
  for (const adj of claim.adjustments) {
    const when = adj.postedAt ?? null;
    if (when) {
      entries.push({
        label: ADJUSTMENT_TYPE_LABEL[adj.type] ?? "Adjustment posted",
        date: when.toISOString(),
        kind: "adjustment",
      });
    }
  }

  // Denial-event resolutions — terminal/status changes on the denial.
  for (const e of claim.denialEvents) {
    if (e.resolution !== "pending" && e.resolvedAt) {
      const isTerminal =
        e.resolution === "overturned" ||
        e.resolution === "written_off" ||
        e.resolution === "patient_responsibility";
      entries.push({
        label:
          DENIAL_RESOLUTION_LABEL[e.resolution] ??
          `Resolved — ${e.resolution.replace(/_/g, " ")}`,
        date: e.resolvedAt.toISOString(),
        kind: isTerminal ? "resolved" : "revision",
      });
    }
  }

  // Claim closure as a final terminal marker if recorded.
  if (claim.closedAt) {
    const closure = (claim.closureType ?? "").replace(/_/g, " ");
    entries.push({
      label: closure ? `Claim closed — ${closure}` : "Claim closed",
      date: claim.closedAt.toISOString(),
      kind: "resolved",
    });
  }

  // Sort chronologically. The denial anchor (or any null-dated entry) sorts to
  // the front; everything else by ascending timestamp.
  entries.sort((a, b) => {
    if (a.date === null) return -1;
    if (b.date === null) return 1;
    return a.date.localeCompare(b.date);
  });

  return entries;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  hint?: string;
}) {
  const colors: Record<string, string> = {
    neutral: "text-text",
    success: "text-success",
    warning: "text-[color:var(--warning)]",
    danger: "text-danger",
    accent: "text-accent",
  };
  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <p className={`font-display text-3xl tabular-nums ${colors[tone]}`}>
          {value}
        </p>
        <p className="text-xs text-text-muted mt-1">{label}</p>
        {hint && <p className="text-[10px] text-text-subtle mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function FilterTab({
  label,
  count,
  active,
  href,
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-all ${
        active
          ? "bg-accent text-accent-ink shadow-sm"
          : "bg-surface-muted text-text-muted hover:bg-surface-raised border border-border"
      }`}
    >
      {label}
      <span
        className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
          active
            ? "bg-accent-ink/20 text-accent-ink"
            : "bg-surface text-text-subtle"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
