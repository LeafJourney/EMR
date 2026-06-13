import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LeafSprig } from "@/components/ui/ornament";
import { dispatch } from "@/lib/orchestration/dispatch";
import { runTick } from "@/lib/orchestration/runner";
import { revalidatePath } from "next/cache";
import { LaunchChecklist } from "./launch-checklist";
import {
  buildCountdown,
  countdownSummary,
  blockerAlerts,
  CHECKLIST_PHASES,
  LAUNCH_RUNBOOK,
  type LaunchProgress,
  type TaskState,
} from "@/lib/platform/launch-checklist";

export const metadata = { title: "Practice launch" };

async function refreshLaunch() {
  "use server";
  const user = await requireUser();
  if (!user.organizationId) return;
  await dispatch({
    name: "practice.onboarding.started",
    organizationId: user.organizationId,
  });
  if (process.env.NODE_ENV !== "production") {
    await runTick("inline-dev", 2);
  }
  revalidatePath("/ops/launch");
  revalidatePath("/ops");
}

// Demo history for readiness score timeline
const DEMO_HISTORY = [
  { date: "Mar 15", score: 12, note: "Initial assessment" },
  { date: "Mar 22", score: 28, note: "Added clinician profiles" },
  { date: "Mar 29", score: 45, note: "Intake form configured" },
  { date: "Apr 2", score: 58, note: "EHR integration connected" },
  { date: "Apr 5", score: 72, note: "Compliance docs uploaded" },
  { date: "Apr 8", score: 85, note: "Test patients processed" },
];

export default async function LaunchPage() {
  const user = await requireUser();
  const status = await prisma.practiceLaunchStatus.findUnique({
    where: { organizationId: user.organizationId! },
  });

  const blockers = (status?.blockers ?? []) as string[];
  const nextSteps = (status?.nextSteps ?? []) as string[];
  const currentScore = status?.readinessScore ?? 0;

  // Trim demo history to only points <= current score, or show all if current is high
  const visibleHistory = DEMO_HISTORY.filter((h) => h.score <= currentScore + 5);

  // 15-day countdown view (EMR-173). When the practice has no per-task
  // progress in storage yet we infer state from the readiness score so the
  // surface is never empty.
  const progress: LaunchProgress = inferProgressFromScore(currentScore);
  const countdown = buildCountdown();
  const summary = countdownSummary(progress);
  const alerts = blockerAlerts(progress);

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="Practice launch"
        title="Go-live readiness"
        description="What's left before your practice can accept its first real patient."
        actions={
          <form action={refreshLaunch}>
            <Button type="submit" variant="secondary">
              Refresh
            </Button>
          </form>
        }
      />

      {/* ---- Score hero ---- */}
      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle>Readiness score</CardTitle>
          <CardDescription>Evaluated by the Practice Launch agent.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 mb-6">
            <div className="relative">
              <span className="font-display text-5xl font-medium text-text tabular-nums leading-none">
                {currentScore}
              </span>
              <span className="text-lg text-text-muted ml-1">%</span>
            </div>
            <div className="flex-1">
              <div className="h-3 bg-surface-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-[#3A8560] rounded-full transition-all"
                  style={{ width: `${currentScore}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5">
                <span className="text-[10px] text-text-subtle">0%</span>
                <span className="text-[10px] text-text-subtle">Ready to launch</span>
                <span className="text-[10px] text-text-subtle">100%</span>
              </div>
            </div>
          </div>

          {/* ---- Score timeline ---- */}
          {visibleHistory.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-3">
                Progress history
              </p>
              <div className="relative pl-6">
                <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border-strong/40" />
                <ul className="space-y-3">
                  {visibleHistory.map((h, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-6 top-1.5 h-[9px] w-[9px] rounded-full border-2 border-surface-raised bg-accent" />
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-text tabular-nums">
                          {h.score}%
                        </span>
                        <span className="text-[10px] text-text-subtle font-mono">{h.date}</span>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">{h.note}</p>
                    </li>
                  ))}
                  {/* Current score marker */}
                  <li className="relative">
                    <span className="absolute -left-6 top-1.5 h-[9px] w-[9px] rounded-full border-2 border-surface-raised bg-highlight" />
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-accent tabular-nums">
                        {currentScore}%
                      </span>
                      <Badge tone="accent" className="!text-[9px]">current</Badge>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">Latest evaluation</p>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Blockers & Next steps ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Blockers</CardTitle>
              {blockers.length > 0 && (
                <Badge tone="danger">{blockers.length}</Badge>
              )}
            </div>
            <CardDescription>Issues that must be resolved before go-live.</CardDescription>
          </CardHeader>
          <CardContent>
            {blockers.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-accent">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                No blockers. Looking good!
              </div>
            ) : (
              <ul className="space-y-3">
                {blockers.map((b, i) => (
                  <li key={i} className="flex items-start gap-3 group">
                    <span className="mt-1 h-5 w-5 rounded-md border border-red-200 bg-red-50 flex items-center justify-center shrink-0">
                      <svg width="10" height="10" viewBox="0 0 10 10" className="text-danger">
                        <path
                          d="M2 2L8 8M8 2L2 8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                    <span className="text-sm text-text-muted leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Next steps</CardTitle>
              {nextSteps.length > 0 && (
                <Badge tone="accent">{nextSteps.length}</Badge>
              )}
            </div>
            <CardDescription>Mark items complete as you work through them.</CardDescription>
          </CardHeader>
          <CardContent>
            {nextSteps.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-accent">
                <LeafSprig size={16} className="text-accent" />
                All steps complete!
              </div>
            ) : (
              <LaunchChecklist items={nextSteps} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- 15-day countdown (EMR-173) ---- */}
      <Card tone="raised" className="mt-6">
        <CardHeader>
          <div className="flex items-baseline gap-3 flex-wrap">
            <CardTitle>15-day launch countdown</CardTitle>
            <Badge tone={summary.activeDay >= 13 ? "danger" : summary.activeDay >= 8 ? "warning" : "accent"}>
              {summary.activeDay <= 15 ? `Day ${summary.activeDay} of 15` : "Launched"}
            </Badge>
          </div>
          <CardDescription>
            Compliance, data migration, training, go-live — every task with an
            owner, a system surface, and a blocker flag.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SummaryStat label="Days remaining" value={`${summary.businessDaysRemaining}`} />
            <SummaryStat label="Tasks done" value={`${summary.doneTasks} / ${summary.totalTasks}`} />
            <SummaryStat label="Days closed" value={`${summary.daysReady} / 15`} />
            <SummaryStat label="Effort left" value={`${summary.remainingEtaHours}h`} />
          </div>

          {summary.nextAction && (
            <div className="rounded-xl border border-accent/30 bg-accent-soft/30 px-5 py-4 mb-6">
              <p className="text-[10px] uppercase tracking-[0.14em] text-accent font-medium mb-1">
                Next action — Day {summary.nextAction.day}
              </p>
              <p className="text-sm text-text font-medium">{summary.nextAction.title}</p>
              <p className="text-xs text-text-muted mt-1">
                Owner: {summary.nextAction.owner.replace(/_/g, " ")} ·{" "}
                <a className="text-accent hover:underline" href={summary.nextAction.surface}>
                  Open {summary.nextAction.surface}
                </a>
              </p>
            </div>
          )}

          {/* Blocker alerts */}
          {alerts.length > 0 && (
            <div className="mb-6">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">
                Blocker alerts ({alerts.length})
              </p>
              <ul className="space-y-2">
                {alerts.slice(0, 5).map((a) => (
                  <li
                    key={a.taskId}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                      a.severity === "critical"
                        ? "border-red-200 bg-red-50/60"
                        : a.severity === "warn"
                          ? "border-amber-200 bg-amber-50/60"
                          : "border-border bg-surface"
                    }`}
                  >
                    <span
                      className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                        a.severity === "critical"
                          ? "bg-danger"
                          : a.severity === "warn"
                            ? "bg-amber-500"
                            : "bg-text-subtle"
                      }`}
                    />
                    <div className="flex-1">
                      <p className="text-sm text-text font-medium">
                        Day {a.day} · {a.title}
                      </p>
                      <p className="text-xs text-text-muted leading-relaxed mt-0.5">{a.detail}</p>
                      <p className="text-[11px] text-text-subtle mt-1">
                        Owner: {a.owner.replace(/_/g, " ")} · Surface:{" "}
                        <a className="text-accent hover:underline" href={a.surface}>
                          {a.surface}
                        </a>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Phase-grouped countdown */}
          <div className="space-y-6">
            {CHECKLIST_PHASES.map((phase) => (
              <div key={phase.phase}>
                <div className="flex items-baseline justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                    {phase.label}
                  </p>
                  <p className="text-[11px] text-text-subtle">Days {phase.days[0]}–{phase.days[phase.days.length - 1]}</p>
                </div>
                <p className="text-xs text-text-muted mb-3">{phase.description}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {countdown
                    .filter((d) => phase.days.includes(d.day))
                    .map((d) => {
                      const taskStates = d.tasks.map((t) => progress.states[t.id] ?? "pending");
                      const allDone = taskStates.every((s) => s === "done" || s === "skipped");
                      const anyOpen = taskStates.some((s) => s !== "done" && s !== "skipped");
                      const isActive = d.day === summary.activeDay;
                      return (
                        <div
                          key={d.day}
                          className={`rounded-xl border p-4 ${
                            allDone
                              ? "border-accent/40 bg-accent-soft/20"
                              : isActive
                                ? "border-highlight/60 bg-highlight-soft/20 ring-1 ring-highlight/30"
                                : "border-border bg-surface"
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2 mb-2">
                            <p className="font-display text-base text-text">{d.label}</p>
                            <span className="text-[10px] font-mono text-text-subtle">{d.countdown}</span>
                          </div>
                          <p className="text-[12px] text-text-muted leading-relaxed">{d.theme}</p>
                          <p className="text-[11px] text-text-subtle mt-2 italic leading-relaxed">
                            Goal: {d.exitCriteria}
                          </p>
                          <ul className="mt-3 space-y-1">
                            {d.tasks.map((t) => {
                              const state = progress.states[t.id] ?? "pending";
                              const done = state === "done" || state === "skipped";
                              return (
                                <li
                                  key={t.id}
                                  className="flex items-start gap-2 text-[12px] text-text-muted leading-relaxed"
                                >
                                  <span
                                    className={`mt-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border shrink-0 ${
                                      done
                                        ? "bg-accent border-accent text-white"
                                        : t.blocker
                                          ? "border-danger/60"
                                          : "border-border-strong"
                                    }`}
                                    aria-hidden
                                  >
                                    {done && (
                                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                                        <path
                                          d="M2 4.2 L3.4 5.6 L6 3"
                                          stroke="currentColor"
                                          strokeWidth="1.5"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    )}
                                  </span>
                                  <span>
                                    {t.title}
                                    {t.blocker && !done && (
                                      <span className="ml-1 text-[10px] uppercase tracking-wider text-danger font-medium">
                                        blocked
                                      </span>
                                    )}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                          {!allDone && anyOpen && d.day < 15 && (
                            <p className="text-[10px] text-text-subtle mt-2">
                              Owner mix: {Array.from(new Set(d.tasks.map((t) => t.owner.replace(/_/g, " ")))).join(", ")}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---- Launch-day runbook ---- */}
      <Card tone="raised" className="mt-6">
        <CardHeader>
          <CardTitle>Launch-day runbook</CardTitle>
          <CardDescription>
            Hour-by-hour schedule for go-live morning. Gates marked with a
            green dot must be signed off before the next step starts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="relative pl-6 space-y-3">
            <span className="absolute left-[7px] top-1 bottom-1 w-px bg-border-strong/40" />
            {LAUNCH_RUNBOOK.map((step, i) => (
              <li key={i} className="relative">
                <span
                  className={`absolute -left-6 top-1.5 h-[10px] w-[10px] rounded-full border-2 border-surface-raised ${
                    step.gate ? "bg-accent" : "bg-text-subtle"
                  }`}
                  aria-hidden
                />
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-mono text-xs text-text-subtle tabular-nums">{step.timeOfDay}</span>
                  <span className="text-sm font-medium text-text">{step.title}</span>
                  {step.gate && (
                    <Badge tone="accent" className="!text-[9px]">
                      gate
                    </Badge>
                  )}
                  <span className="text-[10px] text-text-subtle ml-auto">
                    {step.owner.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-xs text-text-muted leading-relaxed mt-1">{step.description}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle font-medium">{label}</p>
      <p className="font-display text-xl text-text mt-1 tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Until per-task state is persisted, infer rough progress from the
 * existing readinessScore so the countdown shows something meaningful.
 * The first N% of tasks (by plan order) are marked done.
 */
function inferProgressFromScore(score: number): LaunchProgress {
  if (score <= 0) return { states: {} };
  const states: Record<string, TaskState> = {};
  // Walk the plan in day order; mark the first floor(N*total/100) as done.
  const all = buildCountdown().flatMap((d) => d.tasks);
  const target = Math.floor((score / 100) * all.length);
  for (let i = 0; i < target; i++) {
    states[all[i].id] = "done";
  }
  return { states };
}
