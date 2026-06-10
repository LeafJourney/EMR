import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { Eyebrow } from "@/components/ui/ornament";
import type { GoalMetric, TreatmentGoal } from "@/lib/domain/treatment-goals";
import { GOAL_METRIC_LABELS } from "@/lib/domain/treatment-goals";
import { GoalsView, type GoalSeed } from "./goals-view";

export const metadata = { title: "Treatment Goals" };

/**
 * Treatment goals page.
 *
 * EMR-1113 (PJ-1): goals now persist to the TreatmentGoal table (created via
 * the NewGoalForm → createGoal server action). The "current value" for each
 * goal is computed from the patient's most recent OutcomeLog entry for the
 * matching metric. Demo seeds render ONLY when the patient has no real goals,
 * clearly labeled "Example".
 */
export default async function GoalsPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!patient) redirect("/portal/intake");

  // Pull recent outcome logs to compute "current value" by metric
  const recent = await prisma.outcomeLog.findMany({
    where: { patientId: patient.id },
    orderBy: { loggedAt: "desc" },
    take: 200,
  });

  const latestByMetric: Record<string, number> = {};
  for (const log of recent) {
    if (latestByMetric[log.metric] === undefined) {
      latestByMetric[log.metric] = log.value;
    }
  }

  // Real persisted goals (active + achieved; archived goals stay hidden)
  const dbGoals = await prisma.treatmentGoal.findMany({
    where: { patientId: patient.id, status: { in: ["active", "achieved"] } },
    orderBy: { createdAt: "desc" },
  });

  const realGoals: GoalSeed[] = dbGoals.map((g) => {
    const metric = (
      g.metric in GOAL_METRIC_LABELS ? g.metric : "pain"
    ) as GoalMetric;
    return {
      goal: {
        id: g.id,
        patientId: g.patientId,
        metric,
        direction: g.targetValue < g.baselineValue ? "decrease" : "increase",
        baseline: g.baselineValue,
        target: g.targetValue,
        startedAt: g.createdAt.toISOString(),
        targetDate: g.targetDate?.toISOString(),
        status: g.status === "achieved" ? "achieved" : "active",
      } satisfies TreatmentGoal,
      currentValue: latestByMetric[metric] ?? g.baselineValue,
    };
  });

  // Demo seeds — shown only while the patient has no goals of their own,
  // labeled "Example" in the UI.
  let seeds: GoalSeed[] = realGoals;
  if (realGoals.length === 0) {
    const now = Date.now();
    const fourteenDaysAgo = new Date(now - 14 * 86400000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 86400000).toISOString();
    const targetDate = new Date(now + 30 * 86400000).toISOString();

    seeds = [
      {
        goal: {
          id: "demo-pain",
          patientId: patient.id,
          metric: "pain",
          direction: "decrease",
          baseline: 7,
          target: 3,
          startedAt: fourteenDaysAgo,
          targetDate,
          status: "active",
        } satisfies TreatmentGoal,
        currentValue: latestByMetric["pain"] ?? 5,
        isExample: true,
      },
      {
        goal: {
          id: "demo-sleep",
          patientId: patient.id,
          metric: "sleep",
          direction: "increase",
          baseline: 5,
          target: 8,
          startedAt: sevenDaysAgo,
          targetDate,
          status: "active",
        } satisfies TreatmentGoal,
        currentValue: latestByMetric["sleep"] ?? 5,
        isExample: true,
      },
    ];
  }

  return (
    <PageShell maxWidth="max-w-[860px]">
      <PatientSectionNav section="health" />
      <div className="mb-10 text-center">
        <Eyebrow className="justify-center mb-3">Treatment goals</Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight">
          Where you're headed
        </h1>
        <p className="text-[15px] text-text-muted mt-3 max-w-md mx-auto leading-relaxed">
          Set the outcomes that matter to you. We'll track your progress and
          share it with your care team.
        </p>
      </div>

      <GoalsView seeds={seeds} latestByMetric={latestByMetric} />
    </PageShell>
  );
}
