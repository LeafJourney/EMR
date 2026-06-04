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
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/ornament";
import { formatDate } from "@/lib/utils/format";
import { formatMoney } from "@/lib/domain/billing";
import {
  ageClaims,
  recoverabilityScore,
  daysInAR,
  BUCKET_ORDER,
  type AgingBucket,
} from "@/lib/billing/aging";
import { AgingFilters, RECOVERABLE_OPTIONS } from "./aging-filters";

export const metadata = { title: "Aging Workbench" };

// Focus dimension selected by the four KPI boxes (EMR-941).
type AgingFocus = "all" | "insurance" | "patient" | "days";

const FOCUS_TITLES: Record<AgingFocus, string> = {
  all: "Total A/R — Aging buckets",
  insurance: "Insurance A/R — Aging buckets",
  patient: "Patient A/R — Aging buckets",
  days: "Days in A/R — Aging buckets",
};

const FOCUS_DESCRIPTIONS: Record<AgingFocus, string> = {
  all: "How balances are distributed across age ranges.",
  insurance: "Insurance balances distributed across age ranges.",
  patient: "Patient balances distributed across age ranges.",
  days: "Balances emphasised by age — oldest ranges first.",
};

const BUCKET_COLORS: Record<AgingBucket, string> = {
  "0-30": "var(--success)",
  "31-60": "var(--accent)",
  "61-90": "var(--highlight)",
  "91-120": "var(--warning)",
  "120+": "var(--danger)",
};

const BUCKET_LABELS: Record<AgingBucket, string> = {
  "0-30": "0–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "91-120": "91–120 days",
  "120+": "120+ days",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AgingPage({
  searchParams,
}: {
  searchParams: {
    bucket?: string;
    type?: string;
    days?: string;
    recoverable?: string;
  };
}) {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  const isBucket = (v?: string): v is AgingBucket =>
    !!v && (BUCKET_ORDER as string[]).includes(v);

  // Days and bucket are the same dimension; either param selects an age range.
  const activeDays: AgingBucket | null = isBucket(searchParams.days)
    ? searchParams.days
    : isBucket(searchParams.bucket)
      ? searchParams.bucket
      : null;

  // Focus driven by the four KPI boxes (EMR-941).
  const rawType = searchParams.type;
  const focus: AgingFocus =
    rawType === "insurance" ||
    rawType === "patient" ||
    rawType === "days" ||
    rawType === "all"
      ? rawType
      : "all";

  // Recoverability band (EMR-961).
  const recoverableBand =
    RECOVERABLE_OPTIONS.find((o) => o.value === searchParams.recoverable) ??
    null;

  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      status: { notIn: ["written_off"] },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      payments: { select: { source: true, amountCents: true } },
    },
    orderBy: { serviceDate: "asc" },
  });

  const { aged, totals } = ageClaims(claims);
  const dar = daysInAR(claims);

  // Filter
  let filtered = aged;
  if (activeDays) {
    filtered = filtered.filter((a) => a.bucket === activeDays);
  }
  // The "insurance"/"patient" focus narrows the worklist to that A/R type.
  if (focus === "insurance") {
    filtered = filtered.filter((a) => a.insuranceBalanceCents > 0);
  } else if (focus === "patient") {
    filtered = filtered.filter((a) => a.patientBalanceCents > 0);
  }
  if (recoverableBand) {
    filtered = filtered.filter((a) => {
      const score = recoverabilityScore(a);
      return score >= recoverableBand.min && score <= recoverableBand.max;
    });
  }

  // "Days in A/R" focus emphasises the age dimension: oldest first.
  if (focus === "days") {
    filtered = [...filtered].sort((a, b) => b.ageDays - a.ageDays);
  }

  // Bucket bars: when the "days" box is focused, walk oldest → newest.
  const bucketDisplayOrder =
    focus === "days" ? [...BUCKET_ORDER].reverse() : BUCKET_ORDER;

  // Day-range options for the filter bubbles, sourced from the page's labels.
  const dayOptions = BUCKET_ORDER.map((b) => ({
    value: b,
    label: BUCKET_LABELS[b],
  }));

  // Build patient lookup
  const patientMap = Object.fromEntries(
    claims.map((c) => [c.id, c.patient]),
  );

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Practice management"
        title="Aging workbench"
        description="Insurance A/R and patient A/R, bucketed by age. Work the oldest first."
      />

      {/* Top stats — clickable; each refocuses the buckets below (EMR-941) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total A/R"
          value={formatMoney(totals.total)}
          hint={`${aged.length} open balances`}
          href={focusHref("all", searchParams)}
          active={focus === "all"}
        />
        <StatCard
          label="Insurance A/R"
          value={formatMoney(totals.insurance)}
          tone="accent"
          hint={`${totals.total > 0 ? Math.round((totals.insurance / totals.total) * 100) : 0}% of total`}
          href={focusHref("insurance", searchParams)}
          active={focus === "insurance"}
        />
        <StatCard
          label="Patient A/R"
          value={formatMoney(totals.patient)}
          tone="warning"
          hint={`${totals.total > 0 ? Math.round((totals.patient / totals.total) * 100) : 0}% of total`}
          href={focusHref("patient", searchParams)}
          active={focus === "patient"}
        />
        <StatCard
          label="Days in A/R"
          value={dar.toString()}
          hint="average across open claims"
          href={focusHref("days", searchParams)}
          active={focus === "days"}
        />
      </div>

      {/* Bucket distribution */}
      <Card tone="raised" className="mb-8">
        <CardHeader>
          <Eyebrow className="mb-1">{FOCUS_TITLES[focus]}</Eyebrow>
          <CardTitle className="text-base">Aging buckets</CardTitle>
          <CardDescription>{FOCUS_DESCRIPTIONS[focus]}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {bucketDisplayOrder.map((bucket) => {
              const data = totals.byBucket[bucket];
              const pct = totals.total > 0 ? (data.total / totals.total) * 100 : 0;
              const isActiveBucket = activeDays === bucket;
              return (
                <Link
                  key={bucket}
                  href={bucketHref(bucket, searchParams, isActiveBucket)}
                  className={`block group rounded-md transition-colors ${
                    isActiveBucket ? "bg-accent-soft/60 -mx-2 px-2 py-1.5" : ""
                  }`}
                >
                  <div className="flex items-center gap-4 mb-1.5">
                    <div className="flex items-center gap-2 w-32">
                      <span
                        className="h-3 w-3 rounded-sm"
                        style={{ backgroundColor: BUCKET_COLORS[bucket] }}
                      />
                      <span className="text-sm font-medium text-text group-hover:text-accent transition-colors">
                        {BUCKET_LABELS[bucket]}
                      </span>
                    </div>
                    <div className="flex-1 h-6 bg-surface-muted rounded-md overflow-hidden flex">
                      {data.insurance > 0 && (
                        <div
                          className={`h-full bg-accent/60 transition-opacity ${
                            focus === "patient" ? "opacity-25" : ""
                          }`}
                          style={{
                            width: `${(data.insurance / Math.max(totals.total, 1)) * 100}%`,
                          }}
                          title={`Insurance: ${formatMoney(data.insurance)}`}
                        />
                      )}
                      {data.patient > 0 && (
                        <div
                          className={`h-full bg-[color:var(--warning)]/60 transition-opacity ${
                            focus === "insurance" ? "opacity-25" : ""
                          }`}
                          style={{
                            width: `${(data.patient / Math.max(totals.total, 1)) * 100}%`,
                          }}
                          title={`Patient: ${formatMoney(data.patient)}`}
                        />
                      )}
                    </div>
                    <div className="text-right w-32">
                      <p className="text-sm font-medium text-text tabular-nums">
                        {formatMoney(data.total)}
                      </p>
                      <p className="text-[10px] text-text-subtle">
                        {pct.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/60 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-accent/60" />
              <span className="text-text-muted">Insurance A/R</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-[color:var(--warning)]/60" />
              <span className="text-text-muted">Patient A/R</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter bubbles (EMR-961) — synced with the bucket bars above */}
      <AgingFilters
        type={focus === "insurance" || focus === "patient" ? focus : "all"}
        days={activeDays}
        recoverable={recoverableBand?.value ?? null}
        dayOptions={dayOptions}
      />

      {/* Worklist */}
      <div className="mb-4">
        <Eyebrow>Worklist {activeDays && `· ${BUCKET_LABELS[activeDays]}`}</Eyebrow>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Nothing in this bucket"
          description="A clean A/R is the goal. Pick a different filter or revisit later."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => {
            const patient = patientMap[entry.id];
            const score = recoverabilityScore(entry);
            return (
              <Card key={entry.id} tone="raised">
                <CardContent className="py-4">
                  <div className="flex items-center gap-4">
                    {patient && (
                      <Avatar
                        firstName={patient.firstName}
                        lastName={patient.lastName}
                        size="sm"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {patient && (
                          <Link
                            href={`/clinic/patients/${patient.id}/billing`}
                            className="text-sm font-medium text-text hover:text-accent transition-colors"
                          >
                            {patient.firstName} {patient.lastName}
                          </Link>
                        )}
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: BUCKET_COLORS[entry.bucket] }}
                        />
                        <span className="text-[11px] text-text-subtle">
                          {entry.ageDays}d · {entry.payerName ?? "Self-pay"}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-subtle">
                        DOS {formatDate(entry.serviceDate)} ·{" "}
                        <span className="capitalize">{entry.status}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Insurance vs patient breakdown */}
                      <div className="text-right">
                        {entry.insuranceBalanceCents > 0 && (
                          <p className="text-xs text-accent tabular-nums">
                            Ins: {formatMoney(entry.insuranceBalanceCents)}
                          </p>
                        )}
                        {entry.patientBalanceCents > 0 && (
                          <p className="text-xs text-[color:var(--warning)] tabular-nums">
                            Pt: {formatMoney(entry.patientBalanceCents)}
                          </p>
                        )}
                      </div>
                      <div className="text-right w-24">
                        <p className="font-display text-base text-text tabular-nums">
                          {formatMoney(entry.balanceCents)}
                        </p>
                        <p className="text-[10px] text-text-subtle">
                          {score}% recoverable
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// URL helpers — preserve unrelated params while flipping focus / bucket.
// ---------------------------------------------------------------------------

type AgingSearchParams = {
  bucket?: string;
  type?: string;
  days?: string;
  recoverable?: string;
};

function buildHref(params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `/ops/aging?${qs}` : "/ops/aging";
}

function toParams(sp: AgingSearchParams): URLSearchParams {
  const p = new URLSearchParams();
  if (sp.bucket) p.set("bucket", sp.bucket);
  if (sp.type) p.set("type", sp.type);
  if (sp.days) p.set("days", sp.days);
  if (sp.recoverable) p.set("recoverable", sp.recoverable);
  return p;
}

// KPI box → set/clear the focus dimension, keeping days/recoverable filters.
function focusHref(focus: AgingFocus, sp: AgingSearchParams): string {
  const p = toParams(sp);
  if (focus === "all") p.delete("type");
  else p.set("type", focus);
  return buildHref(p);
}

// Bucket bar → toggle the age range. `days` is canonical; clear legacy `bucket`.
function bucketHref(
  bucket: AgingBucket,
  sp: AgingSearchParams,
  isActive: boolean,
): string {
  const p = toParams(sp);
  p.delete("bucket");
  if (isActive) p.delete("days");
  else p.set("days", bucket);
  return buildHref(p);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
  href,
  active = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  hint?: string;
  href?: string;
  active?: boolean;
}) {
  const colors: Record<string, string> = {
    neutral: "text-text",
    success: "text-success",
    warning: "text-[color:var(--warning)]",
    danger: "text-danger",
    accent: "text-accent",
  };
  const card = (
    <Card
      tone="raised"
      className={`h-full transition-all ${
        href ? "group-hover:border-accent/60" : ""
      } ${active ? "border-accent ring-1 ring-accent/40" : ""}`}
    >
      <CardContent className="pt-5 pb-5">
        <p className={`font-display text-2xl tabular-nums ${colors[tone]}`}>
          {value}
        </p>
        <p
          className={`text-xs mt-1 ${
            active ? "text-accent font-medium" : "text-text-muted"
          }`}
        >
          {label}
        </p>
        {hint && <p className="text-[10px] text-text-subtle mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );

  if (!href) return card;
  return (
    <Link
      href={href}
      aria-pressed={active}
      className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      {card}
    </Link>
  );
}
