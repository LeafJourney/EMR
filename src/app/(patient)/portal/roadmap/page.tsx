import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EditorialRule, Eyebrow, LeafSprig } from "@/components/ui/ornament";
import { formatDate } from "@/lib/utils/format";
import type { NoteBlock } from "@/lib/domain/notes";
import {
  TimelineWithFilters,
  type TimelineEventData,
  type EventKind,
} from "./timeline-card";

import { SleepHygieneCard } from "@/components/lifestyle/sleep-hygiene-card";
import { MealPlanCard } from "@/components/lifestyle/meal-plan-card";
import { ExerciseRegimenCard } from "@/components/lifestyle/exercise-regimen-card";
import { StressReductionCard } from "@/components/lifestyle/stress-reduction-card";
import { HabitFormationCard } from "@/components/lifestyle/habit-formation-card";
import { SocialConnectivityCard } from "@/components/lifestyle/social-connectivity-card";

export const metadata = { title: "Health Roadmap" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a readable summary from encounter note blocks. */
function extractNoteSummary(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return null;
  const typed = blocks as NoteBlock[];
  const summary =
    typed.find((b) => b.type === "summary") ??
    typed.find((b) => b.type === "assessment") ??
    typed[0];
  if (!summary?.body) return null;
  const text = summary.body.trim();
  return text.length > 200 ? text.slice(0, 200).trimEnd() + "\u2026" : text;
}

function modalityLabel(modality: string): string {
  if (modality === "video") return "Video visit";
  if (modality === "phone") return "Phone visit";
  return "In-person visit";
}

function encounterStatusBadge(status: string): {
  label: string;
  tone: "success" | "accent" | "info" | "neutral";
} {
  if (status === "complete") return { label: "Completed", tone: "success" };
  if (status === "scheduled") return { label: "Upcoming", tone: "accent" };
  if (status === "in_progress")
    return { label: "In progress", tone: "info" };
  return { label: "Cancelled", tone: "neutral" };
}

/** Pretty metric label. */
const METRIC_LABELS: Record<string, string> = {
  pain: "Pain",
  sleep: "Sleep quality",
  anxiety: "Anxiety",
  mood: "Mood",
  nausea: "Nausea",
  appetite: "Appetite",
  energy: "Energy",
  adherence: "Adherence",
  side_effects: "Side effects",
};

/**
 * "Higher is better" metrics — for these, an increase means improvement.
 * For all others (pain, anxiety, nausea, side_effects), a decrease means
 * improvement.
 */
const HIGHER_IS_BETTER = new Set(["sleep", "mood", "appetite", "energy", "adherence"]);

// ---------------------------------------------------------------------------
// Milestone detection algorithm
// ---------------------------------------------------------------------------

interface MilestoneCandidate {
  metric: string;
  fromValue: number;
  toValue: number;
  fromDate: Date;
  toDate: Date;
  improvement: number;
}

/**
 * Detect milestones: a metric improving by 2+ points within any 14-day
 * sliding window. We return at most one milestone per metric (the largest
 * improvement).
 */
function detectMilestones(
  outcomeLogs: Array<{
    metric: string;
    value: number;
    loggedAt: Date;
  }>
): MilestoneCandidate[] {
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  const THRESHOLD = 2;

  // Group by metric, sort ascending by date
  const byMetric: Record<string, Array<{ value: number; loggedAt: Date }>> = {};
  for (const log of outcomeLogs) {
    if (!byMetric[log.metric]) byMetric[log.metric] = [];
    byMetric[log.metric].push({ value: log.value, loggedAt: log.loggedAt });
  }

  const milestones: MilestoneCandidate[] = [];

  for (const [metric, logs] of Object.entries(byMetric)) {
    const sorted = [...logs].sort(
      (a, b) => a.loggedAt.getTime() - b.loggedAt.getTime()
    );
    if (sorted.length < 2) continue;

    const hib = HIGHER_IS_BETTER.has(metric);
    let bestImprovement = 0;
    let bestCandidate: MilestoneCandidate | null = null;

    // Sliding window: for each pair within 14 days, compute improvement
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const timeDiff = sorted[j].loggedAt.getTime() - sorted[i].loggedAt.getTime();
        if (timeDiff > TWO_WEEKS_MS) break; // no point looking further from i

        const rawDelta = sorted[j].value - sorted[i].value;
        // Improvement direction depends on metric
        const improvement = hib ? rawDelta : -rawDelta;

        if (improvement >= THRESHOLD && improvement > bestImprovement) {
          bestImprovement = improvement;
          bestCandidate = {
            metric,
            fromValue: sorted[i].value,
            toValue: sorted[j].value,
            fromDate: sorted[i].loggedAt,
            toDate: sorted[j].loggedAt,
            improvement,
          };
        }
      }
    }

    if (bestCandidate) milestones.push(bestCandidate);
  }

  return milestones.sort(
    (a, b) => a.toDate.getTime() - b.toDate.getTime()
  );
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getTimelineData(patientId: string) {
  const [encounters, outcomeLogs, regimens, assessmentResponses, tasks] =
    await Promise.all([
      prisma.encounter.findMany({
        where: { patientId },
        orderBy: { scheduledFor: "desc" },
        include: {
          notes: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        take: 50,
      }),
      prisma.outcomeLog.findMany({
        where: { patientId },
        orderBy: { loggedAt: "asc" },
        take: 200,
      }),
      prisma.dosingRegimen.findMany({
        where: { patientId },
        orderBy: { startDate: "desc" },
        include: {
          product: {
            select: { name: true, productType: true, route: true },
          },
        },
        take: 30,
      }),
      prisma.assessmentResponse.findMany({
        where: { patientId },
        orderBy: { submittedAt: "desc" },
        include: {
          assessment: { select: { title: true, slug: true } },
        },
        take: 50,
      }),
      prisma.task.findMany({
        where: { patientId, status: "done" },
        orderBy: { completedAt: "desc" },
        take: 20,
      }),
    ]);

  return { encounters, outcomeLogs, regimens, assessmentResponses, tasks };
}

// ---------------------------------------------------------------------------
// Build unified timeline
// ---------------------------------------------------------------------------

function buildTimeline(data: Awaited<ReturnType<typeof getTimelineData>>): TimelineEventData[] {
  const events: TimelineEventData[] = [];

  // --- Visits ---
  for (const enc of data.encounters) {
    const statusBadge = encounterStatusBadge(enc.status);
    const noteBlocks = enc.notes[0]?.blocks ?? null;
    const noteSummary = extractNoteSummary(noteBlocks);

    events.push({
      id: `visit-${enc.id}`,
      kind: "visit",
      date: (enc.scheduledFor ?? enc.createdAt).toISOString(),
      title: `${modalityLabel(enc.modality)}${enc.reason ? ` -- ${enc.reason}` : ""}`,
      subtitle: noteSummary,
      badges: [statusBadge],
      detail: noteSummary
        ? `Note summary:\n${noteSummary}`
        : enc.reason
          ? `Reason: ${enc.reason}`
          : null,
    });
  }

  // --- Medication changes ---
  for (const reg of data.regimens) {
    const doseStr = reg.patientInstructions ??
      `${reg.volumePerDose} ${reg.volumeUnit} x${reg.frequencyPerDay}/day`;

    const mgParts: string[] = [];
    if (reg.calculatedThcMgPerDose) mgParts.push(`THC ${reg.calculatedThcMgPerDose}mg`);
    if (reg.calculatedCbdMgPerDose) mgParts.push(`CBD ${reg.calculatedCbdMgPerDose}mg`);

    events.push({
      id: `med-${reg.id}`,
      kind: "medication",
      date: reg.startDate.toISOString(),
      title: `${reg.active ? "Started" : "Changed"}: ${reg.product.name}`,
      subtitle: doseStr,
      badges: [
        { label: reg.product.productType, tone: "neutral" as const },
        ...(reg.active
          ? [{ label: "Active", tone: "success" as const }]
          : [{ label: "Ended", tone: "neutral" as const }]),
      ],
      detail: [
        `Product: ${reg.product.name}`,
        `Route: ${reg.product.route}`,
        `Dose: ${doseStr}`,
        mgParts.length > 0 ? `Per dose: ${mgParts.join(", ")}` : null,
        reg.timingInstructions ? `Timing: ${reg.timingInstructions}` : null,
        reg.clinicianNotes ? `Clinician notes: ${reg.clinicianNotes}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  // --- Assessment responses ---
  for (const resp of data.assessmentResponses) {
    const scoreStr = resp.score !== null ? `Score: ${resp.score}` : null;

    events.push({
      id: `assess-${resp.id}`,
      kind: "assessment",
      date: resp.submittedAt.toISOString(),
      title: resp.assessment.title,
      subtitle: [scoreStr, resp.interpretation].filter(Boolean).join(" -- "),
      badges: [
        ...(resp.score !== null
          ? [{ label: `${resp.score}`, tone: "info" as const }]
          : []),
        ...(resp.interpretation
          ? [
              {
                label: resp.interpretation,
                tone: (resp.interpretation.toLowerCase().includes("minimal") ||
                  resp.interpretation.toLowerCase().includes("mild")
                  ? "success"
                  : resp.interpretation.toLowerCase().includes("moderate")
                    ? "warning"
                    : resp.interpretation.toLowerCase().includes("severe")
                      ? "danger"
                      : "neutral") as "success" | "warning" | "danger" | "neutral",
              },
            ]
          : []),
      ],
      detail: resp.interpretation
        ? `Assessment: ${resp.assessment.title}\nScore: ${resp.score ?? "--"}\nInterpretation: ${resp.interpretation}`
        : null,
    });
  }

  // --- Outcome milestones ---
  const milestones = detectMilestones(data.outcomeLogs);
  for (const m of milestones) {
    const label = METRIC_LABELS[m.metric] ?? m.metric;
    const direction = HIGHER_IS_BETTER.has(m.metric) ? "improved" : "decreased";

    events.push({
      id: `milestone-${m.metric}-${m.toDate.getTime()}`,
      kind: "milestone",
      date: m.toDate.toISOString(),
      title: `${label} ${direction} by ${m.improvement.toFixed(1)} points`,
      subtitle: `${m.fromValue.toFixed(1)} \u2192 ${m.toValue.toFixed(1)} over ${Math.round((m.toDate.getTime() - m.fromDate.getTime()) / (24 * 60 * 60 * 1000))} days`,
      badges: [{ label: "Milestone", tone: "highlight" }],
      detail: `${label} went from ${m.fromValue.toFixed(1)} to ${m.toValue.toFixed(1)} between ${formatDate(m.fromDate)} and ${formatDate(m.toDate)}. That's a ${m.improvement.toFixed(1)}-point improvement in ${Math.round((m.toDate.getTime() - m.fromDate.getTime()) / (24 * 60 * 60 * 1000))} days.`,
      isMilestone: true,
    });
  }

  // --- Completed tasks ---
  for (const task of data.tasks) {
    if (!task.completedAt) continue;

    events.push({
      id: `task-${task.id}`,
      kind: "task",
      date: task.completedAt.toISOString(),
      title: task.title,
      subtitle: task.description
        ? task.description.length > 100
          ? task.description.slice(0, 100).trimEnd() + "\u2026"
          : task.description
        : null,
      badges: [{ label: "Done", tone: "success" }],
      detail: task.description,
    });
  }

  // Sort all events by date descending (newest first)
  events.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return events;
}

// ---------------------------------------------------------------------------
// Summary stats
// ---------------------------------------------------------------------------

interface SummaryStats {
  totalVisits: number;
  completedVisits: number;
  activeRegimens: number;
  assessmentsTaken: number;
  milestonesReached: number;
  tasksCompleted: number;
  latestMetrics: Record<string, number>;
}

function computeStats(
  data: Awaited<ReturnType<typeof getTimelineData>>,
  events: TimelineEventData[]
): SummaryStats {
  const latestMetrics: Record<string, number> = {};
  // outcomeLogs are sorted asc, so last per metric is latest
  for (const log of data.outcomeLogs) {
    latestMetrics[log.metric] = log.value;
  }

  return {
    totalVisits: data.encounters.length,
    completedVisits: data.encounters.filter(
      (e: { status: string }) => e.status === "complete"
    ).length,
    activeRegimens: data.regimens.filter(
      (r: { active: boolean }) => r.active
    ).length,
    assessmentsTaken: data.assessmentResponses.length,
    milestonesReached: events.filter((e) => e.kind === "milestone").length,
    tasksCompleted: data.tasks.length,
    latestMetrics,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function RoadmapPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      firstName: true,
      treatmentGoals: true,
      presentingConcerns: true,
    },
  });

  if (!patient) {
    redirect("/portal/intake");
  }

  const data = await getTimelineData(patient.id);
  const events = buildTimeline(data);
  const stats = computeStats(data, events);

  const hasAnyData = events.length > 0;

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PatientSectionNav section="journey" />
      <PageHeader
        eyebrow="Health Roadmap"
        title="Your health journey"
        description="Every visit, treatment change, assessment, and milestone -- all in one place. Click any event to see details."
      />

      {/* ================================================================
          Summary strip
          ================================================================ */}
      {hasAnyData && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8 print:grid-cols-6">
          <StatCard
            label="Visits"
            value={stats.completedVisits}
            total={stats.totalVisits}
            dot="bg-green-500"
          />
          <StatCard
            label="Medications"
            value={stats.activeRegimens}
            suffix="active"
            dot="bg-purple-500"
          />
          <StatCard
            label="Assessments"
            value={stats.assessmentsTaken}
            dot="bg-blue-500"
          />
          <StatCard
            label="Milestones"
            value={stats.milestonesReached}
            dot="bg-amber-500"
          />
          <StatCard
            label="Tasks done"
            value={stats.tasksCompleted}
            dot="bg-gray-400"
          />
          <StatCard
            label="Metrics tracked"
            value={Object.keys(stats.latestMetrics).length}
            dot="bg-accent"
          />
        </div>
      )}

      {/* ================================================================
          Current metrics snapshot
          ================================================================ */}
      {Object.keys(stats.latestMetrics).length > 0 && (
        <Card tone="raised" className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <LeafSprig size={16} />
              <CardTitle>Current metrics</CardTitle>
            </div>
            <CardDescription>
              Latest values from your outcome check-ins
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.latestMetrics).map(([metric, value]) => {
                const hib = HIGHER_IS_BETTER.has(metric);
                const tone = hib
                  ? value >= 7
                    ? ("success" as const)
                    : value >= 4
                      ? ("warning" as const)
                      : ("danger" as const)
                  : value <= 3
                    ? ("success" as const)
                    : value <= 6
                      ? ("warning" as const)
                      : ("danger" as const);
                return (
                  <Badge key={metric} tone={tone}>
                    {METRIC_LABELS[metric] ?? metric}: {value.toFixed(1)}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <EditorialRule className="mb-8" />

      {/* ================================================================
          Lifestyle Care Plans (Wave 1 Expansion)
          ================================================================ */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-display text-xl text-text tracking-tight">
            Lifestyle Care Plans
          </h2>
          <Badge tone="accent">Recommended</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SleepHygieneCard />
          <MealPlanCard />
          <ExerciseRegimenCard />
          <StressReductionCard />
        </div>
      </section>

      <EditorialRule className="mb-8" />

      {/* ================================================================
          Timeline
          ================================================================ */}
      {!hasAnyData ? (
        <EmptyState
          title="Your health roadmap is empty"
          description="As you visit your care team, log outcomes, take assessments, and start treatments, your journey will appear here as an interactive timeline."
          className="mb-10"
        />
      ) : (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-display text-xl text-text tracking-tight">
              Timeline
            </h2>
            <Badge tone="neutral">{events.length} events</Badge>
          </div>

          <TimelineWithFilters events={events} />
        </section>
      )}

      <EditorialRule className="mb-8" />

      {/* ================================================================
          Milestones highlight
          ================================================================ */}
      {stats.milestonesReached > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-display text-xl text-text tracking-tight">
              Milestones reached
            </h2>
            <Badge tone="highlight">{stats.milestonesReached}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events
              .filter((e) => e.kind === "milestone")
              .map((m) => (
                <Card
                  key={m.id}
                  tone="ambient"
                  className="border-amber-200/50"
                >
                  <CardContent className="py-5 px-5">
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-0.5 h-5 w-5 rounded-full bg-amber-500 border-2 border-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.4)] shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-sm font-medium text-text">
                          {m.title}
                        </p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {m.subtitle}
                        </p>
                        <p className="text-[11px] text-text-subtle mt-1">
                          {formatDate(m.date)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </section>
      )}

      {/* ================================================================
          Goals reminder
          ================================================================ */}
      {patient.treatmentGoals && (
        <>
          <EditorialRule className="mb-8" />
          <Card tone="raised" className="mb-10">
            <CardHeader>
              <div className="flex items-center gap-2">
                <LeafSprig size={16} />
                <CardTitle>Your stated goals</CardTitle>
              </div>
              <CardDescription>
                A reminder of what you&apos;re working toward
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-muted leading-relaxed italic">
                &ldquo;{patient.treatmentGoals}&rdquo;
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {/* ================================================================
          Disclaimer
          ================================================================ */}
      <p className="text-xs text-text-subtle text-center max-w-lg mx-auto leading-relaxed mb-4">
        This roadmap shows your personal health journey based on data in your
        chart. Milestones are algorithmically detected when a metric improves
        by 2 or more points within a 14-day window. Always consult your care
        team for clinical decisions.
      </p>

      {/* ================================================================
          Print styles (inline style tag for server component)
          ================================================================ */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  /* Show all timeline cards expanded */
  .print\\:grid-cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)) !important; }

  /* Hide interactive elements */
  .print\\:hidden { display: none !important; }

  /* Ensure backgrounds print */
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

  /* Tighten spacing */
  .pb-6 { padding-bottom: 0.75rem !important; }

  /* Ensure page breaks nicely */
  .rounded-xl { break-inside: avoid; }
}
`,
        }}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Small stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  total,
  suffix,
  dot,
}: {
  label: string;
  value: number;
  total?: number;
  suffix?: string;
  dot: string;
}) {
  return (
    <Card tone="raised" className="px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
        <p className="text-[11px] font-medium text-text-muted uppercase tracking-wider truncate">
          {label}
        </p>
      </div>
      <p className="text-lg font-display font-medium text-text">
        {value}
        {total !== undefined && total > value && (
          <span className="text-sm text-text-subtle font-normal">
            {" "}
            / {total}
          </span>
        )}
        {suffix && (
          <span className="text-xs text-text-subtle font-normal ml-1">
            {suffix}
          </span>
        )}
      </p>
    </Card>
  );
}
