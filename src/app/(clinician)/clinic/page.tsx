import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MetricTile } from "@/components/ui/metric-tile";
import { Sparkline } from "@/components/ui/sparkline";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow, EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { formatRelative } from "@/lib/utils/format";
import { RecentPatients } from "@/components/shell/recent-patients";
import { withTimeout } from "@/lib/utils/with-timeout";

// EMR-205: guard the mission-control fan-out so a single hung query
// can never wedge the Suspense boundary and strand clinicians on the
// loading skeleton.
const MISSION_CONTROL_TIMEOUT_MS = 8_000;

// Empty-shape fallback for the 19-way Promise.all below. If the DB
// fan-out times out (or any individual query rejects), we render the
// page with zeros/empty lists instead of stranding the user. Typed as
// `any` intentionally — the destructured tuple has deep Prisma types
// and we just need the shape.
const MISSION_CONTROL_FALLBACK: any = [
  [],  //  1 todaysEncounters
  0,   //  2 openNotes
  [],  //  3 needsReviewNotes
  0,   //  4 approvalJobs
  0,   //  5 activeThreads
  0,   //  6 activePatientCount
  0,   //  7 weekVisits
  0,   //  8 weekFinalizedNotes
  [],  //  9 recentEncounters
  [],  // 10 recentFinalizedNotes
  [],  // 11 recentAssessments
  [],  // 12 recentMessages
  [],  // 13 recentDocuments
  [],  // 14 allChartSummaries
  [0, 0, 0, 0, 0, 0, 0], // 15 dailyEncounterCounts
  0,   // 16 needsReviewCount
  [],  // 17 recentAgentJobs
  [],  // 18 pendingDrafts
  [],  // 19 recentObservations
];

export const metadata = { title: "Mission Control" };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Hello";
}

function modalityLabel(m: string): string {
  switch (m) {
    case "video":
      return "Video";
    case "phone":
      return "Phone";
    case "in_person":
      return "In-person";
    default:
      return m;
  }
}

function modalityTone(m: string): "accent" | "info" | "neutral" {
  switch (m) {
    case "video":
      return "info";
    case "phone":
      return "neutral";
    case "in_person":
      return "accent";
    default:
      return "neutral";
  }
}

/** Circular progress ring rendered as a tiny SVG. */
function ChartReadinessRing({
  percent,
  size = 28,
}: {
  percent: number;
  size?: number;
}) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  const color = percent >= 80 ? "var(--success)" : percent >= 50 ? "var(--highlight)" : "var(--text-subtle)";

  return (
    <svg width={size} height={size} className="shrink-0" aria-label={`${percent}% ready`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--border)"
        strokeWidth="2.5"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-muted)"
        fontSize="8"
        fontWeight="500"
        fontFamily="var(--font-sans)"
      >
        {percent}
      </text>
    </svg>
  );
}

/** Status dot with optional pulse animation. */
function StatusDot({
  color,
  pulse = false,
  label,
  count,
}: {
  color: string;
  pulse?: boolean;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <span className="relative flex h-2.5 w-2.5">
        {pulse && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-50"
            style={{ backgroundColor: color }}
          />
        )}
        <span
          className="relative inline-flex h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      </span>
      <span className="font-display text-lg font-medium tabular-nums leading-none text-text">
        {count}
      </span>
      <span className="text-[11px] text-text-subtle tracking-wide hidden sm:inline">
        {label}
      </span>
    </div>
  );
}

/** Patient readiness status from chart completeness. */
function readinessStatus(score: number | null | undefined): {
  color: string;
  label: string;
} {
  if (score == null) return { color: "var(--text-subtle)", label: "Not started" };
  if (score >= 80) return { color: "var(--success)", label: "Ready" };
  if (score >= 40) return { color: "var(--highlight)", label: "Incomplete intake" };
  return { color: "var(--text-subtle)", label: "Not started" };
}

/* ------------------------------------------------------------------ */
/*  Activity feed item types                                           */
/* ------------------------------------------------------------------ */

interface ActivityItem {
  id: string;
  type: "encounter" | "note_finalized" | "note_draft" | "assessment" | "message" | "document";
  description: string;
  timestamp: Date;
  href: string;
  dotColor: string;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function ClinicHomePage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  /* ---- Parallel data fetches ---- */
  const [
    todaysEncounters,
    openNotes,
    needsReviewNotes,
    approvalJobs,
    activeThreads,
    activePatientCount,
    weekVisits,
    weekFinalizedNotes,
    recentEncounters,
    recentFinalizedNotes,
    recentAssessments,
    recentMessages,
    recentDocuments,
    allChartSummaries,
    dailyEncounterCounts,
    needsReviewCount,
    // Fleet bridge data
    recentAgentJobs,
    pendingDrafts,
    recentObservations,
  ] = await withTimeout(
    Promise.all([
    // 1. Today's encounters
    //    Exclude encounters whose patient has been soft-deleted — otherwise
    //    the card would render with a ghost patient and the Prepare button
    //    would 404 downstream.
    // Today's encounters — bounded by calendar day. 200/day is well past
    // any realistic single-clinician schedule and serves as a defensive
    // ceiling for multi-provider orgs sharing this dashboard view.
    prisma.encounter.findMany({
      where: {
        organizationId,
        scheduledFor: { gte: startOfDay, lt: endOfDay },
        patient: { deletedAt: null },
      },
      include: { patient: { include: { chartSummary: true } } },
      orderBy: { scheduledFor: "asc" },
      take: 200,
    }),

    // 2. Draft notes count
    prisma.note.count({
      where: { status: "draft", encounter: { organizationId } },
    }),

    // 3. Notes needing review (full list for sidebar)
    prisma.note.findMany({
      where: {
        status: { in: ["draft", "needs_review"] },
        encounter: { organizationId },
      },
      include: {
        encounter: {
          include: { patient: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),

    // 4. Agent jobs needing approval
    prisma.agentJob.count({
      where: { organizationId, status: "needs_approval" },
    }),

    // 5. Active message threads
    prisma.messageThread.count({
      where: {
        patient: { organizationId },
        messages: { some: { status: "sent" } },
      },
    }),

    // 6. Active patient count
    prisma.patient.count({
      where: { organizationId, status: "active" },
    }),

    // 7. This week's visits
    prisma.encounter.count({
      where: {
        organizationId,
        scheduledFor: { gte: startOfWeek, lt: endOfDay },
      },
    }),

    // 8. Notes finalized this week
    prisma.note.count({
      where: {
        status: "finalized",
        finalizedAt: { gte: startOfWeek },
        encounter: { organizationId },
      },
    }),

    // 9. Recent completed encounters (activity feed)
    //    Same deleted-patient guard as the today list.
    prisma.encounter.findMany({
      where: {
        organizationId,
        status: "complete",
        patient: { deletedAt: null },
      },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { completedAt: "desc" },
      take: 5,
    }),

    // 10. Recently finalized notes (activity feed)
    prisma.note.findMany({
      where: { status: "finalized", encounter: { organizationId } },
      include: {
        encounter: {
          include: { patient: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
      orderBy: { finalizedAt: "desc" },
      take: 5,
    }),

    // 11. Recent assessment responses (activity feed)
    prisma.assessmentResponse.findMany({
      where: { patient: { organizationId } },
      include: {
        assessment: { select: { title: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 5,
    }),

    // 12. Recent messages (activity feed)
    prisma.message.findMany({
      where: {
        status: "sent",
        thread: { patient: { organizationId } },
      },
      include: {
        thread: {
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { sentAt: "desc" },
      take: 5,
    }),

    // 13. Recent documents (activity feed)
    prisma.document.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // 14. Chart summaries for avg readiness. Cap matches the patient roster
    // ceiling — past 500 active patients per org we should be sampling
    // server-side, not dumping every score into memory for an average.
    prisma.chartSummary.findMany({
      where: { patient: { organizationId, status: "active" } },
      select: { completenessScore: true },
      take: 500,
    }),

    // 15. Daily encounter counts for sparkline (last 7 days)
    Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfDay);
        d.setDate(d.getDate() - (6 - i));
        const next = new Date(d.getTime() + 86_400_000);
        return prisma.encounter.count({
          where: {
            organizationId,
            scheduledFor: { gte: d, lt: next },
          },
        });
      })
    ),

    // 16. Notes in needs_review status (for command strip count)
    prisma.note.count({
      where: { status: "needs_review", encounter: { organizationId } },
    }),

    // 17. Recent agent jobs (fleet bridge — last 24h, succeeded + needs_approval)
    prisma.agentJob.findMany({
      where: {
        organizationId,
        status: { in: ["succeeded", "needs_approval"] },
        completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { agentName: true, status: true, completedAt: true },
      orderBy: { completedAt: "desc" },
      take: 50,
    }),

    // 18. Pending AI drafts (fleet bridge — approval count per agent).
    // Cap at 500 — if the queue is bigger than that the count widget
    // should show "500+" and ops needs a real backlog dashboard, not a
    // dropdown render dumping the full backlog.
    prisma.message.findMany({
      where: {
        status: "draft",
        aiDrafted: true,
        thread: { patient: { organizationId } },
      },
      select: { senderAgent: true },
      take: 500,
    }),

    // 19. Recent unacknowledged clinical observations
    prisma.clinicalObservation.findMany({
      where: {
        patient: { organizationId },
        acknowledgedAt: null,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, severity: true, category: true, summary: true, observedBy: true, createdAt: true, patientId: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]).catch((err) => {
    console.warn("[clinic.home] mission-control fan-out rejected:", err);
    return MISSION_CONTROL_FALLBACK;
  }),
    MISSION_CONTROL_TIMEOUT_MS,
    MISSION_CONTROL_FALLBACK,
    "clinic.home",
  );

  /* ---- Derived values ---- */
  const notesToSign = openNotes + needsReviewCount;

  const avgReadiness =
    allChartSummaries.length > 0
      ? Math.round(
          allChartSummaries.reduce((s: number, c: { completenessScore: number }) => s + c.completenessScore, 0) /
            allChartSummaries.length
        )
      : 0;

  /* ---- Build unified activity feed ---- */
  const activityFeed: ActivityItem[] = [];

  for (const enc of recentEncounters) {
    activityFeed.push({
      id: `enc-${enc.id}`,
      type: "encounter",
      description: `${enc.patient.firstName} ${enc.patient.lastName} — encounter completed`,
      timestamp: enc.completedAt ?? enc.updatedAt,
      href: `/clinic/patients/${enc.patient.id}`,
      dotColor: "var(--accent)",
    });
  }

  for (const note of recentFinalizedNotes) {
    activityFeed.push({
      id: `note-${note.id}`,
      type: "note_finalized",
      description: `${note.encounter.patient.firstName} ${note.encounter.patient.lastName} — note finalized`,
      timestamp: note.finalizedAt ?? note.updatedAt,
      href: `/clinic/patients/${note.encounter.patient.id}/notes/${note.id}`,
      dotColor: "var(--accent)",
    });
  }

  for (const ar of recentAssessments) {
    const scorePart = ar.score != null ? ` (score: ${ar.score})` : "";
    activityFeed.push({
      id: `assess-${ar.id}`,
      type: "assessment",
      description: `${ar.patient.firstName} ${ar.patient.lastName} — ${ar.assessment.title} submitted${scorePart}`,
      timestamp: ar.submittedAt,
      href: `/clinic/patients/${ar.patient.id}`,
      dotColor: "var(--info)",
    });
  }

  for (const msg of recentMessages) {
    activityFeed.push({
      id: `msg-${msg.id}`,
      type: "message",
      description: `${msg.thread.patient.firstName} ${msg.thread.patient.lastName} — message received`,
      timestamp: msg.sentAt ?? msg.createdAt,
      href: `/clinic/patients/${msg.thread.patient.id}`,
      dotColor: "var(--info)",
    });
  }

  for (const doc of recentDocuments) {
    activityFeed.push({
      id: `doc-${doc.id}`,
      type: "document",
      description: `${doc.patient.firstName} ${doc.patient.lastName} — ${doc.kind} uploaded`,
      timestamp: doc.createdAt,
      href: `/clinic/patients/${doc.patient.id}`,
      dotColor: "var(--text-subtle)",
    });
  }

  // Sort by most recent first, cap at 15
  activityFeed.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const feed = activityFeed.slice(0, 15);

  /* ---- Date display ---- */
  const dateStr = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <PageShell maxWidth="max-w-[1320px]">
      {/* ============================================================
          1. COMMAND STRIP
          ============================================================ */}
      <Card
        tone="raised"
        className="mb-8 border-l-[3px] border-l-accent"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 px-6 py-4">
          {/* Left: Name + date */}
          <div className="flex items-center gap-3 shrink-0">
            <LeafSprig size={20} className="text-accent/70 hidden sm:block" />
            <div>
              <h1 className="font-display text-xl font-medium text-text tracking-tight leading-tight">
                {greeting()},{" "}
                <span className="text-accent">{user.firstName}</span>
              </h1>
              <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle mt-0.5">
                {dateStr}
              </p>
            </div>
          </div>

          {/* Center: Live status indicators */}
          <div className="flex items-center gap-6 flex-wrap">
            <StatusDot
              color="var(--accent)"
              count={todaysEncounters.length}
              label="Patients today"
            />
            <StatusDot
              color="var(--highlight)"
              pulse={notesToSign > 0}
              count={notesToSign}
              label="Notes to sign"
            />
            <StatusDot
              color="var(--highlight)"
              pulse={approvalJobs > 0}
              count={approvalJobs}
              label="Approvals"
            />
            <StatusDot
              color="var(--text-subtle)"
              count={activeThreads}
              label="Threads"
            />
          </div>

          {/* Right: Quick actions */}
          <div className="flex items-center gap-3 shrink-0">
            <form action="/clinic/patients" method="get" className="hidden md:block">
              <input
                type="search"
                name="q"
                placeholder="Search patients..."
                className="h-9 w-48 rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 transition-colors"
              />
            </form>
            <Link href="/clinic/patients?new=1">
              <Button size="sm">New visit</Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* ============================================================
          1b. FLEET BRIDGE — orientation across the agentic team
          ============================================================ */}
      {(() => {
        // Compute fleet activity metrics
        const jobsByAgent: Record<string, { succeeded: number; needsApproval: number }> = {};
        for (const job of recentAgentJobs) {
          const entry = jobsByAgent[job.agentName] ?? { succeeded: 0, needsApproval: 0 };
          if (job.status === "succeeded") entry.succeeded++;
          if (job.status === "needs_approval") entry.needsApproval++;
          jobsByAgent[job.agentName] = entry;
        }

        const draftsByAgent: Record<string, number> = {};
        for (const d of pendingDrafts) {
          const name = d.senderAgent?.split(":")[0] ?? "unknown";
          draftsByAgent[name] = (draftsByAgent[name] ?? 0) + 1;
        }

        const totalJobsLast24h = recentAgentJobs.length;
        const totalPendingDrafts = pendingDrafts.length;
        const urgentObservations = recentObservations.filter((o: any) => o && (o.severity === "urgent" || o.severity === "concern"));

        // Agent display names
        const AGENT_NAMES: Record<string, string> = {
          correspondenceNurse: "Nurse Nora",
          scribe: "Scribe",
          preVisitIntelligence: "Visit Prep",
          codingOptimization: "Code Optimizer",
          encounterIntelligence: "Charge Capture",
          claimConstruction: "Claim Builder",
          chargeIntegrity: "Scrubber",
          denialResolution: "Denial Resolver",
          complianceAudit: "Compliance",
          eligibilityBenefits: "Eligibility",
          outcomeTracker: "Outcomes",
          patientOutreach: "Outreach",
          physicianNudge: "Coach",
        };

        // Top 6 agents by activity
        const topAgents = Object.entries(jobsByAgent)
          .map(([name, counts]) => ({
            name,
            displayName: AGENT_NAMES[name] ?? name,
            total: counts.succeeded + counts.needsApproval,
            drafts: draftsByAgent[name] ?? 0,
            ...counts,
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 6);

        if (totalJobsLast24h === 0 && totalPendingDrafts === 0 && recentObservations.length === 0) {
          return null; // hide bridge when fleet is quiet
        }

        return (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <Eyebrow>Your AI team — last 24 hours</Eyebrow>
              <Link
                href="/clinic/approvals"
                className="text-xs text-accent hover:underline"
              >
                {totalPendingDrafts > 0
                  ? `${totalPendingDrafts} draft${totalPendingDrafts !== 1 ? "s" : ""} waiting →`
                  : "Approvals →"}
              </Link>
            </div>

            {/* Agent roster strip — CLICKABLE to agent detail */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
              {topAgents.map((agent) => (
                <Link
                  key={agent.name}
                  href={`/clinic/agents/${encodeURIComponent(agent.name)}`}
                >
                  <Card className="px-3 py-2.5 card-hover cursor-pointer">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          agent.drafts > 0
                            ? "bg-highlight animate-pulse"
                            : agent.total > 0
                              ? "bg-success"
                              : "bg-border-strong"
                        }`}
                      />
                      <span className="text-[12px] font-medium text-text truncate">
                        {agent.displayName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-text-muted tabular-nums">
                        {agent.total} task{agent.total !== 1 ? "s" : ""}
                      </span>
                      {agent.drafts > 0 && (
                        <span className="text-[color:var(--highlight-hover)] font-medium tabular-nums">
                          {agent.drafts} draft{agent.drafts !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Observations strip — CLICKABLE to patient chart */}
            {urgentObservations.length > 0 && (
              <Card className="border-l-4 border-l-[color:var(--warning)] px-4 py-3 mb-4">
                <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle mb-2">
                  Your team is noticing
                </p>
                <div className="space-y-1">
                  {urgentObservations.slice(0, 4).map((obs: any) => (
                    <Link
                      key={obs.id}
                      href={`/clinic/patients/${obs.patientId}`}
                      className="flex items-start gap-2 py-1 px-1 -mx-1 rounded hover:bg-surface-muted/50 transition-colors group"
                    >
                      <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                        obs.severity === "urgent" ? "bg-danger" : "bg-[color:var(--warning)]"
                      }`} />
                      <p className="text-xs text-text leading-relaxed line-clamp-1 group-hover:text-accent transition-colors flex-1">
                        {obs.summary}
                      </p>
                      <span className="text-text-subtle group-hover:text-accent text-xs shrink-0">&rarr;</span>
                    </Link>
                  ))}
                </div>
              </Card>
            )}

            {/* Drafts waiting — PROMINENT action panel */}
            {totalPendingDrafts > 0 && (
              <Link href="/clinic/approvals">
                <Card className="border-l-4 border-l-accent card-hover cursor-pointer px-5 py-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                        <LeafSprig size={18} className="text-accent" />
                      </span>
                      <div>
                        <p className="font-display text-lg text-text tracking-tight">
                          {totalPendingDrafts} draft{totalPendingDrafts !== 1 ? "s" : ""} waiting for you
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          AI-drafted messages and notes ready for your review
                        </p>
                      </div>
                    </div>
                    <Button size="sm">Review now</Button>
                  </div>
                </Card>
              </Link>
            )}
          </section>
        );
      })()}

      {/* ============================================================
          2. PATIENT QUEUE — horizontal scroll rail
          ============================================================ */}
      <section className="mb-10">
        <Eyebrow className="mb-4">Today&apos;s queue</Eyebrow>

        {todaysEncounters.length === 0 ? (
          <Card tone="outlined" className="py-10 px-6">
            <div className="flex flex-col items-center text-center">
              <LeafSprig size={32} className="text-accent/40 mb-3" />
              <p className="font-display text-lg text-text">
                Clear schedule.
              </p>
              <p className="text-sm text-text-muted mt-1">
                A good day to catch up on notes.
              </p>
            </div>
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin">
            {todaysEncounters.map((enc: any) => {
              const readiness = enc.patient.chartSummary?.completenessScore ?? null;
              const status = readinessStatus(readiness);

              return (
                <div key={enc.id} className="shrink-0 snap-start">
                  <Card
                    tone="raised"
                    className="w-64 card-hover flex flex-col justify-between p-4 group"
                  >
                    {/* Top: Avatar + name + time */}
                    <Link href={`/clinic/patients/${enc.patient.id}`} className="block">
                      <div className="flex items-start gap-3">
                        <Avatar
                          firstName={enc.patient.firstName}
                          lastName={enc.patient.lastName}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text truncate group-hover:text-accent transition-colors">
                            {enc.patient.firstName} {enc.patient.lastName}
                          </p>
                          <p className="text-xs text-text-subtle tabular-nums mt-0.5">
                            {enc.scheduledFor?.toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>

                      {/* Reason / concerns */}
                      {(enc.reason || enc.patient.presentingConcerns) && (
                        <p className="text-xs text-text-muted mt-2 line-clamp-1">
                          {enc.reason ?? enc.patient.presentingConcerns}
                        </p>
                      )}
                    </Link>

                    {/* Bottom: modality + readiness + actions */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                      <div className="flex items-center gap-2">
                        <Badge tone={modalityTone(enc.modality)}>
                          {modalityLabel(enc.modality)}
                        </Badge>
                        {readiness != null && (
                          <ChartReadinessRing percent={readiness} size={24} />
                        )}
                      </div>
                      <Link href={`/clinic/patients/${enc.patient.id}/prepare`}>
                        <Button size="sm" variant="secondary">Prepare</Button>
                      </Link>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <EditorialRule className="mb-10" />

      {/* ============================================================
          3. TWO-COLUMN LAYOUT
          ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* -------- Left column (2/3): Activity feed -------- */}
        <Card tone="raised" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LeafSprig size={16} className="text-accent/80" />
              Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {feed.length === 0 ? (
              <EmptyState
                title="No recent activity"
                description="Clinical events will appear here as they happen."
              />
            ) : (
              <ul className="space-y-1 -mx-2">
                {feed.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-muted/50 transition-colors group"
                    >
                      {/* Type dot */}
                      <span
                        className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.dotColor }}
                      />
                      {/* Description */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text group-hover:text-accent transition-colors leading-snug">
                          {item.description}
                        </p>
                        <p className="text-[11px] text-text-subtle mt-0.5 tabular-nums">
                          {formatRelative(item.timestamp)}
                        </p>
                      </div>
                      {/* Arrow */}
                      <span
                        aria-hidden="true"
                        className="text-text-subtle group-hover:text-accent transition-colors mt-0.5 text-sm"
                      >
                        &rarr;
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* -------- Right column (1/3): Stats + Drafts + Research -------- */}
        <div className="space-y-6">
          {/* Recently viewed patients (client-only, hydrates from localStorage) */}
          <RecentPatients />

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <MetricTile
              label="Active patients"
              value={activePatientCount}
              accent="forest"
            />
            <MetricTile
              label="This week"
              value={weekVisits}
              hint="Visits"
              accent="forest"
            />
            <MetricTile
              label="Finalized"
              value={weekFinalizedNotes}
              hint="Notes this week"
              accent="amber"
            />
            <MetricTile
              label="Chart ready"
              value={`${avgReadiness}%`}
              hint="Avg readiness"
              accent="none"
            />
          </div>

          {/* Weekly visits sparkline */}
          <Card tone="default" className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">
              Visits — last 7 days
            </p>
            <Sparkline
              data={dailyEncounterCounts}
              width={280}
              height={48}
              color="var(--accent)"
              fill="var(--accent-soft)"
            />
          </Card>

          {/* Notes needing attention */}
          <Card tone="default">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span
                  className="h-2 w-2 rounded-full bg-highlight"
                  aria-hidden="true"
                />
                Notes needing attention
              </CardTitle>
            </CardHeader>
            <CardContent>
              {needsReviewNotes.length === 0 ? (
                <p className="text-sm text-text-muted py-4 text-center">
                  All clear. No notes need attention.
                </p>
              ) : (
                <ul className="space-y-1 -mx-2">
                  {needsReviewNotes.map((note: any) => (
                    <li key={note.id}>
                      <Link
                        href={`/clinic/patients/${note.encounter.patient.id}/notes/${note.id}`}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-muted/50 transition-colors group"
                      >
                        <Avatar
                          firstName={note.encounter.patient.firstName}
                          lastName={note.encounter.patient.lastName}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text truncate group-hover:text-accent transition-colors">
                            {note.encounter.patient.firstName}{" "}
                            {note.encounter.patient.lastName}
                          </p>
                        </div>
                        <Badge
                          tone={note.status === "needs_review" ? "warning" : "neutral"}
                        >
                          {note.status === "needs_review" ? "Review" : "Draft"}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Research shortcut */}
          <Card tone="outlined" className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">
              Quick research
            </p>
            <form
              action="/clinic/research"
              method="get"
              className="flex items-center gap-2"
            >
              <input
                type="text"
                name="q"
                placeholder="e.g. CBD for neuropathic pain..."
                className="flex-1 h-9 rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 transition-colors"
              />
              <Button size="sm" variant="secondary" type="submit">
                Go
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
