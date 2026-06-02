/**
 * EMR-062 — Ancillary Services
 *
 * Single hub for the non-physician care team: occupational therapy,
 * physical therapy, speech-language pathology, case management, and
 * home health. Pulls every active referral / order across these
 * disciplines into one queue so the clinician can see what's open
 * and route follow-up tasks without bouncing between modules.
 *
 * All queue math (staleness, sort order, per-discipline rollups, the
 * four hero tiles) is delegated to `@/lib/clinical/ancillary-services`
 * so this file stays a thin presentation layer and the same rules can
 * drive the morning brief or any AI summary that talks about open
 * referrals.
 */

import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ALL_DISCIPLINES,
  DISCIPLINE_LABEL,
  ageDays,
  disciplineFromParam,
  filterQueue,
  isStale,
  queueSummary,
  rollupByDiscipline,
  sortQueue,
  type AncillaryReferral,
  type AncillaryStatus,
} from "@/lib/clinical/ancillary-services";

export const metadata = { title: "Ancillary services" };

interface PageProps {
  searchParams?: { discipline?: string | string[] };
}

// Demo dataset, typed against the engine. Real production traffic
// populates this from the referral/order tables; the page logic is
// identical either way because every number flows through the engine.
const daysAgoIso = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const SAMPLE_REFERRALS: AncillaryReferral[] = [
  {
    id: "anc-001",
    discipline: "pt",
    patientName: "Rivera, M.",
    orderedByUserId: "u-pcp",
    reason: "Post-arthroscopy meniscus repair — gait + strength",
    status: "scheduled",
    orderedAt: daysAgoIso(8),
    lastActivityAt: daysAgoIso(2),
    nextStep: "First eval Wed 9:00",
  },
  {
    id: "anc-002",
    discipline: "ot",
    patientName: "Nguyen, L.",
    orderedByUserId: "u-pcp",
    reason: "Long-haul COVID — energy conservation training",
    status: "in_progress",
    orderedAt: daysAgoIso(21),
    lastActivityAt: daysAgoIso(18),
    nextStep: "Re-eval at session 6 (overdue — chase scheduling)",
  },
  {
    id: "anc-003",
    discipline: "speech",
    patientName: "Patel, A.",
    orderedByUserId: "u-pcp",
    reason: "Post-stroke aphasia — comprehension > expression",
    status: "pending",
    orderedAt: daysAgoIso(4),
    nextStep: "Awaiting insurance auth",
  },
  {
    id: "anc-004",
    discipline: "case_mgmt",
    patientName: "Hassan, K.",
    orderedByUserId: "u-pcp",
    reason: "SNF → home transition, lives alone",
    status: "in_progress",
    orderedAt: daysAgoIso(12),
    lastActivityAt: daysAgoIso(1),
    nextStep: "Home safety eval scheduled Thu",
  },
  {
    id: "anc-005",
    discipline: "home_health",
    patientName: "Garcia, R.",
    orderedByUserId: "u-pcp",
    reason: "PICC line maintenance — IV ceftriaxone 4 wks",
    status: "in_progress",
    orderedAt: daysAgoIso(9),
    lastActivityAt: daysAgoIso(0),
    nextStep: "Daily flush + dressing change",
  },
  {
    id: "anc-006",
    discipline: "pt",
    patientName: "Olafsson, B.",
    orderedByUserId: "u-pcp",
    reason: "Chronic LBP — McKenzie protocol",
    status: "completed",
    orderedAt: daysAgoIso(74),
    lastActivityAt: daysAgoIso(3),
    nextStep: "Discharge summary received",
  },
  {
    id: "anc-007",
    discipline: "ot",
    patientName: "Williams, J.",
    orderedByUserId: "u-pcp",
    reason: "Hand therapy after distal radius ORIF",
    status: "pending",
    orderedAt: daysAgoIso(1),
    nextStep: "Patient to call for intake",
  },
  {
    id: "anc-008",
    discipline: "speech",
    patientName: "Okonkwo, D.",
    orderedByUserId: "u-pcp",
    reason: "Dysphagia after prolonged intubation — swallow study",
    status: "scheduled",
    orderedAt: daysAgoIso(20),
    lastActivityAt: daysAgoIso(16),
    nextStep: "MBSS booked, no confirmation back",
  },
];

const STATUS_LABEL: Record<AncillaryStatus, string> = {
  pending: "pending",
  scheduled: "scheduled",
  in_progress: "in progress",
  completed: "completed",
  declined: "declined",
};

export default async function AncillaryPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (!user.organizationId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const now = new Date();
  const active = disciplineFromParam(searchParams?.discipline);

  // Org-wide rollups for the discipline cards + the first two hero tiles.
  const rollups = rollupByDiscipline(SAMPLE_REFERRALS, now);
  const orgSummary = queueSummary(SAMPLE_REFERRALS, now);

  // The "view" reflects the active discipline filter (if any).
  const viewReferrals = filterQueue(SAMPLE_REFERRALS, { discipline: active });
  const viewSummary = queueSummary(viewReferrals, now);
  const openInView = sortQueue(
    filterQueue(SAMPLE_REFERRALS, { discipline: active, openOnly: true }),
    now,
  );

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Ancillary services"
        title="Care team queue"
        description="OT, PT, speech, case management, and home health — all open referrals, with the next step clearly named so nothing slides."
        actions={
          <Link href="/clinic/patients">
            <Button variant="primary" size="sm">
              Place referral
            </Button>
          </Link>
        }
      />

      {active && (
        <div className="mb-6 flex items-center gap-2 text-sm">
          <Badge tone="accent">Filtered · {DISCIPLINE_LABEL[active]}</Badge>
          <Link
            href="/clinic/ancillary"
            className="text-text-subtle hover:text-text underline underline-offset-2"
          >
            Clear filter
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <MetricTile
          label="Active caseload"
          value={orgSummary.activeCaseload}
          accent="forest"
          hint="Open referrals across all disciplines"
        />
        <MetricTile
          label="Pending intake"
          value={orgSummary.pendingIntake}
          accent={orgSummary.pendingIntake > 0 ? "amber" : "none"}
          hint="Awaiting first eval or auth"
        />
        <MetricTile
          label={active ? "Open in view" : "Open total"}
          value={viewSummary.open}
          accent="forest"
          hint="Pending + scheduled + in progress"
        />
        <MetricTile
          label="Stale > 14 days"
          value={viewSummary.stale}
          accent={viewSummary.stale > 0 ? "amber" : "none"}
          hint="No movement since last update"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {ALL_DISCIPLINES.map((key) => {
          const roll = rollups.find((d) => d.discipline === key)!;
          const isActive = active === key;
          return (
            <Card
              key={key}
              tone="raised"
              className={isActive ? "ring-1 ring-accent/40" : undefined}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{roll.label}</CardTitle>
                  <Badge tone={roll.pendingIntake > 0 ? "warning" : "neutral"}>
                    {roll.pendingIntake} pending
                  </Badge>
                </div>
                <CardDescription>{DISCIPLINE_BLURB[key]}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle">
                    Caseload
                  </p>
                  <p className="font-display text-2xl text-text tabular-nums">
                    {roll.caseload}
                  </p>
                  {roll.staleCount > 0 && (
                    <p className="text-[11px] text-highlight mt-0.5">
                      {roll.staleCount} stale
                    </p>
                  )}
                </div>
                <Link
                  href={isActive ? "/clinic/ancillary" : `/clinic/ancillary?discipline=${key}`}
                >
                  <Button variant="secondary" size="sm">
                    {isActive ? "Clear" : "Open queue"}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">
            {active ? `Open ${DISCIPLINE_LABEL[active]} referrals` : "Open referrals"}
          </CardTitle>
          <CardDescription>
            Sorted by urgency — stale items first, then by status and oldest
            order. The next step is named on every row so nothing slides.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {openInView.length === 0 ? (
            <EmptyState
              title="No open referrals"
              description="When you order OT, PT, speech, case management, or home health from a chart, it lands here."
            />
          ) : (
            openInView.map((r) => (
              <ReferralRow key={r.id} referral={r} now={now} />
            ))
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

const DISCIPLINE_BLURB: Record<(typeof ALL_DISCIPLINES)[number], string> = {
  ot: "ADLs, fine motor, sensory regulation, return-to-work assessments.",
  pt: "Mobility, balance, post-op rehab, pain-driven movement therapy.",
  speech: "Swallow studies, aphasia recovery, cognitive-communication therapy.",
  case_mgmt: "Care coordination, transitional care, social work hand-offs.",
  home_health: "Skilled nursing, wound care, IV therapy, in-home rehab.",
};

function ReferralRow({
  referral,
  now,
}: {
  referral: AncillaryReferral;
  now: Date;
}) {
  const stale = isStale(referral, now);
  const age = ageDays(referral, now);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_220px_140px] items-center gap-3 rounded-lg px-3 py-3 hover:bg-surface-muted">
      <div className="min-w-0">
        <p className="text-sm text-text">
          {referral.patientName}{" "}
          <span className="text-text-subtle">
            · {DISCIPLINE_LABEL[referral.discipline]}
          </span>
        </p>
        <p className="text-[11px] text-text-subtle truncate">{referral.reason}</p>
      </div>
      <div>
        <Badge tone={statusTone(referral.status)}>
          {STATUS_LABEL[referral.status]}
        </Badge>
      </div>
      <p className="text-xs text-text-muted truncate">
        {referral.nextStep ?? "—"}
      </p>
      <p className="text-xs text-text-subtle tabular-nums">
        {age}d ago
        {stale && (
          <Badge tone="warning" className="ml-2">
            stale
          </Badge>
        )}
      </p>
    </div>
  );
}

function statusTone(
  status: AncillaryStatus,
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
    case "scheduled":
      return "info";
    case "pending":
      return "warning";
    case "declined":
      return "danger";
    default:
      return "neutral";
  }
}
