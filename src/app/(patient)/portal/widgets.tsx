import React from "react";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricTile } from "@/components/ui/metric-tile";
import { Sparkline } from "@/components/ui/sparkline";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";
import { StreakFlame } from "@/components/portal/streak-flame";
import { FreezeTokenStore } from "@/components/portal/freeze-token-store";
import { HealthRings } from "@/components/portal/health-rings";
import { VisitActions } from "@/components/portal/visit-actions";
import { HealthPlant } from "@/components/ui/health-plant";
import { BadgeShowcase } from "@/components/portal/badge-showcase";
import { isLocalDemoUserId } from "@/lib/auth/local-demo";
import { buildLocalDemoPortalPatient, LOCAL_DEMO_PLANT_HEALTH } from "@/lib/domain/patient-portal-demo";
import { computePlantHealth, STAGE_LABELS } from "@/lib/domain/plant-health";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { applyFreezeTokenAction } from "@/app/(patient)/portal/apply-freeze-action";
import { withTimeout } from "@/lib/utils/with-timeout";
import { PWASyncNextVisit, PWASyncTasks, PWASyncStreak } from "@/components/portal/pwa-sync";
import { FadeInWidget } from "@/components/ui/fade-in-widget";



const PATIENT_QUERY_TIMEOUT_MS = 5_000;
const PLANT_HEALTH_TIMEOUT_MS = 2_000;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Hello";
}

// Health grade algorithm: A-F based on outcomes, intake, visits, adherence
function computeHealthGrade(data: {
  outcomeAvg: number | null;
  intakeComplete: number;
  hasRecentVisit: boolean;
  adherenceScore: number | null;
}): { grade: string; color: string; message: string } {
  let score = 50;

  if (data.outcomeAvg !== null) {
    score += Math.round((10 - data.outcomeAvg) * 2);
  }
  score += Math.round(data.intakeComplete * 0.15);
  if (data.hasRecentVisit) score += 10;
  if (data.adherenceScore !== null) {
    score += Math.round(data.adherenceScore * 1.5);
  }

  score = Math.max(0, Math.min(100, score));

  if (score >= 90) return { grade: "A", color: "text-green-600 bg-green-50 border-green-200", message: "Excellent — you are on track." };
  if (score >= 80) return { grade: "B", color: "text-emerald-600 bg-emerald-50 border-emerald-200", message: "Good — keep up the momentum." };
  if (score >= 65) return { grade: "C", color: "text-amber-600 bg-amber-50 border-amber-200", message: "Fair — small changes can make a big difference." };
  if (score >= 50) return { grade: "D", color: "text-orange-600 bg-orange-50 border-orange-200", message: "Room to grow — your care team is here to help." };
  return { grade: "F", color: "text-red-600 bg-red-50 border-red-200", message: "Let's work on this together." };
}

// Lifestyle bar component
function LifestyleBar({ label, value, emoji }: { label: string; value: number | null; emoji: string }) {
  const pct = value !== null ? Math.round(value * 10) : 0;
  const height = value !== null ? `${pct}%` : "0%";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-8 h-24 bg-surface-muted rounded-full overflow-hidden border border-border/50">
        <div
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-accent to-accent/60 rounded-full transition-all duration-700 ease-smooth"
          style={{ height }}
        />
      </div>
      <span className="text-base">{emoji}</span>
      <span className="text-[10px] text-text-subtle font-medium text-center leading-tight w-14">
        {label}
      </span>
      <span className="text-xs font-display text-text tabular-nums">
        {value !== null ? value.toFixed(1) : "—"}
      </span>
    </div>
  );
}

// AI health tip generator (deterministic)
function generateHealthTips(data: {
  latestPain: number | undefined;
  latestSleep: number | undefined;
  latestAnxiety: number | undefined;
  latestMood: number | undefined;
  hasRegimen: boolean;
}): string[] {
  const tips: string[] = [];
  if (data.latestPain !== undefined && data.latestPain > 5) {
    tips.push("Your pain has been elevated. Consider logging when it spikes so we can spot patterns together.");
  }
  if (data.latestSleep !== undefined && data.latestSleep < 5) {
    tips.push("Sleep quality is low. A consistent bedtime routine and avoiding screens before bed can help.");
  }
  if (data.latestAnxiety !== undefined && data.latestAnxiety > 6) {
    tips.push("Anxiety is running high. Even 5 minutes of deep breathing can bring it down a notch.");
  }
  if (data.latestMood !== undefined && data.latestMood < 4) {
    tips.push("Your mood has been low. Gentle movement and sunlight are two of the fastest mood lifters.");
  }
  if (!data.hasRegimen) {
    tips.push("You don't have an active care plan yet. Your next visit is a great time to build one together.");
  }
  if (tips.length === 0) {
    tips.push("You are doing well. Keep logging your outcomes — it helps your care team see the full picture.");
  }
  return tips.slice(0, 2);
}

// Helper to fetch patient data safely
async function fetchPatientData(userId: string, includes: any): Promise<any> {
  const isDemo = isLocalDemoUserId(userId);
  if (isDemo) {
    return buildLocalDemoPortalPatient();
  }

  const res = await withTimeout(
    prisma.patient.findUnique({
      where: { userId },
      include: includes,
    }),
    PATIENT_QUERY_TIMEOUT_MS,
    null,
    "widgets.fetchPatientData"
  );
  return res as any;
}


/* ===========================================================================
   1. HeroGreetingWidget
   =========================================================================== */
export async function HeroGreetingWidget({ userId }: { userId: string }) {
  const patient = await fetchPatientData(userId, {
    dailyStreak: true,
    freezeTokens: { where: { isUsed: false } },
  });

  if (!patient) return null;

  const todayStr = new Date().toISOString().split("T")[0];
  const currentStreak = patient.dailyStreak?.currentStreak ?? 0;
  const longestStreak = patient.dailyStreak?.longestStreak ?? 0;
  const hasCheckedInToday = patient.dailyStreak?.lastCheckInDate === todayStr;

  return (
    <FadeInWidget>
      <section className="relative overflow-hidden rounded-2xl md:rounded-3xl liquid-glass-strong mb-6 md:mb-8">
      <PWASyncStreak streak={patient.dailyStreak} />
      <div className="relative px-6 sm:px-8 md:px-12 py-8 md:py-12 max-w-2xl">
        <div className="flex items-center gap-4 mb-3">
          <Eyebrow className="mb-0">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Eyebrow>
          <StreakFlame 
            currentStreak={currentStreak} 
            longestStreak={longestStreak} 
            hasCheckedInToday={hasCheckedInToday} 
          />
          {patient.freezeTokens && patient.freezeTokens.length > 0 && (
            <FreezeTokenStore 
              availableTokens={patient.freezeTokens.length} 
              onApplyFreeze={applyFreezeTokenAction} 
            />
          )}
        </div>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl leading-[1.1] tracking-tight text-text">
          {greeting()},{" "}
          <span className="italic text-accent">{patient.firstName}</span>.
        </h1>
        <p className="text-sm text-text-muted mt-3 leading-relaxed max-w-lg">
          Here is your health dashboard. A quick check-in helps your care team
          see how things are trending between visits.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
          <Link href="/portal/outcomes" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto min-h-[44px]">Log Check-in</Button>
          </Link>
          <Link href="/portal/messages" className="w-full sm:w-auto">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto min-h-[44px]">Message your team</Button>
          </Link>
        </div>
      </div>
    </section>
  </FadeInWidget>
  );
}

export function HeroGreetingSkeleton() {
  return (
    <section className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-r from-surface-muted to-surface-raised border border-border/40 mb-6 md:mb-8 animate-pulse">
      <div className="relative px-6 sm:px-8 md:px-12 py-8 md:py-12 max-w-2xl space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-4 w-32 bg-border-strong/40 rounded" />
          <div className="h-5 w-12 bg-border-strong/40 rounded-full" />
        </div>
        <div className="h-8 w-64 bg-border-strong/50 rounded" />
        <div className="h-4 w-96 bg-border-strong/40 rounded" />
        <div className="flex gap-3 pt-2">
          <div className="h-11 w-32 bg-border-strong/50 rounded-md" />
          <div className="h-11 w-44 bg-border-strong/40 rounded-md" />
        </div>
      </div>
    </section>
  );
}

/* ===========================================================================
   2. SparklinesWidget
   =========================================================================== */
export async function SparklinesWidget({ userId }: { userId: string }) {
  const patient = await fetchPatientData(userId, {
    outcomeLogs: { orderBy: { loggedAt: "asc" }, take: 100 },
  });

  if (!patient) return null;

  const metricSeries: Record<string, number[]> = {};
  const latestMetric: Record<string, number> = {};
  for (const log of patient.outcomeLogs) {
    if (!metricSeries[log.metric]) metricSeries[log.metric] = [];
    metricSeries[log.metric].push(log.value);
    latestMetric[log.metric] = log.value;
  }

  const painSeries = metricSeries.pain ?? [];
  const sleepSeries = metricSeries.sleep ?? [];
  const latestPain = latestMetric.pain;
  const latestSleep = latestMetric.sleep;

  return (
    <FadeInWidget>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6 md:mb-8">
      <MetricTile label="Pain" accent="forest" value={latestPain !== undefined ? latestPain.toFixed(1) : "—"} hint="0-10 scale" />
      <MetricTile label="Sleep" accent="amber" value={latestSleep !== undefined ? latestSleep.toFixed(1) : "—"} hint="0-10 scale" />
      <div className="bg-surface-raised border border-border rounded-xl p-4 shadow-sm">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">Pain trend</p>
        <Sparkline data={painSeries.length > 1 ? painSeries : [3, 4, 4, 3, 3, 2]} width={180} height={44} />
      </div>
      <div className="bg-surface-raised border border-border rounded-xl p-4 shadow-sm">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">Sleep trend</p>
        <Sparkline data={sleepSeries.length > 1 ? sleepSeries : [5, 5, 6, 6, 7, 7]} width={180} height={44} />
      </div>
      </div>
    </FadeInWidget>
  );
}

export function SparklinesSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6 md:mb-8">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-[104px] bg-gradient-to-r from-surface-muted to-surface-raised border border-border/40 rounded-xl p-4 animate-pulse flex flex-col justify-between">
          <div className="h-3 w-16 bg-border-strong/40 rounded" />
          <div className="h-7 w-24 bg-border-strong/50 rounded" />
        </div>
      ))}
    </div>
  );
}

/* ===========================================================================
   3. RhythmsWidget (Health Rings, Lifestyle Bars, AI Tips)
   =========================================================================== */
export async function RhythmsWidget({ userId }: { userId: string }) {
  const patient = await fetchPatientData(userId, {
    outcomeLogs: { orderBy: { loggedAt: "asc" }, take: 100 },
    chartSummary: true,
    dailyStreak: true,
    dosingRegimens: { where: { active: true } },
    encounters: { orderBy: { scheduledFor: "desc" }, take: 3 },
  });

  if (!patient) return null;

  const metricSeries: Record<string, number[]> = {};
  const latestMetric: Record<string, number> = {};
  for (const log of patient.outcomeLogs) {
    if (!metricSeries[log.metric]) metricSeries[log.metric] = [];
    metricSeries[log.metric].push(log.value);
    latestMetric[log.metric] = log.value;
  }

  const latestPain = latestMetric.pain;
  const latestSleep = latestMetric.sleep;
  const latestAnxiety = latestMetric.anxiety;
  const latestMood = latestMetric.mood;
  const latestEnergy = latestMetric.energy;
  const latestAdherence = latestMetric.adherence;

  const recentVisit = patient.encounters.find((e: any) => e.status === "complete");
  const intakeComplete = patient.chartSummary?.completenessScore ?? 0;

  const todayStr = new Date().toISOString().split("T")[0];
  const hasCheckedInToday = patient.dailyStreak?.lastCheckInDate === todayStr;

  const healthTips = generateHealthTips({
    latestPain,
    latestSleep,
    latestAnxiety,
    latestMood,
    hasRegimen: patient.dosingRegimens.length > 0,
  });

  return (
    <FadeInWidget>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 mb-6 md:mb-8">
      {/* Health Rings */}
      <div className="md:col-span-3 h-full">
        <Card tone="glass" className="h-full text-center">
          <CardContent className="py-6 flex flex-col items-center justify-center h-full">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-4">
              Daily Rings
            </p>
            <HealthRings 
              checkinProgress={hasCheckedInToday ? 1 : 0} 
              adherenceProgress={latestAdherence !== null ? latestAdherence / 100 : 0.2} 
              intakeProgress={intakeComplete / 100} 
              size={120} 
              strokeWidth={12} 
            />
            <div className="mt-5 flex gap-3 text-[10px] text-text-subtle justify-center text-left">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-accent"></div>Check-in</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-highlight"></div>Adherence</div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Intake</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lifestyle Bars */}
      <div className="md:col-span-5 h-full">
        <Card tone="glass" className="h-full">
          <CardContent className="py-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-5">
              Lifestyle measures
            </p>
            <div className="flex items-end justify-around">
              <LifestyleBar label="Sleep" value={latestSleep ?? null} emoji={"\uD83D\uDE34"} />
              <LifestyleBar label="Mood" value={latestMood ?? null} emoji={"\uD83D\uDE0A"} />
              <LifestyleBar label="Energy" value={latestEnergy ?? null} emoji={"\u26A1"} />
              <LifestyleBar label="Anxiety" value={latestAnxiety !== undefined ? 10 - latestAnxiety : null} emoji={"\uD83E\uDDD8"} />
              <LifestyleBar label="Pain" value={latestPain !== undefined ? 10 - latestPain : null} emoji={"\uD83D\uDCAA"} />
            </div>
            <p className="text-[10px] text-text-subtle text-center mt-4">
              Higher bars = better. Based on your latest check-in.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Tips */}
      <div className="md:col-span-4 h-full">
        <Card tone="glass" className="h-full">
          <CardContent className="py-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent mb-4 flex items-center gap-1.5">
              <LeafSprig size={12} className="text-accent/70" />
              Ways to improve
            </p>
            <div className="space-y-3">
              {healthTips.map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent text-[10px] font-medium mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-text-muted leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </FadeInWidget>
  );
}

export function RhythmsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 mb-6 md:mb-8 animate-pulse">
      <div className="md:col-span-3 h-[240px] bg-gradient-to-b from-surface-muted to-surface-raised border border-border/40 rounded-2xl" />
      <div className="md:col-span-5 h-[240px] bg-gradient-to-b from-surface-muted to-surface-raised border border-border/40 rounded-2xl" />
      <div className="md:col-span-4 h-[240px] bg-gradient-to-b from-surface-muted to-surface-raised border border-border/40 rounded-2xl" />
    </div>
  );
}

/* ===========================================================================
   4. CannabisNextVisitMoodWidget
   =========================================================================== */
export async function CannabisNextVisitMoodWidget({ userId }: { userId: string }) {
  const patient = await fetchPatientData(userId, {
    dosingRegimens: {
      where: { active: true },
      include: { product: true },
    },
    encounters: {
      orderBy: { scheduledFor: "desc" },
      take: 3,
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        modality: true,
        completedAt: true,
        briefingContext: true,
      },
    },
    chartSummary: true,
    outcomeLogs: { orderBy: { loggedAt: "asc" }, take: 100 },
  });

  if (!patient) return null;

  const totalThcPerDay = patient.dosingRegimens.reduce(
    (sum: number, r: any) => sum + (r.calculatedThcMgPerDay ?? (r.calculatedThcMgPerDose ?? 0) * r.frequencyPerDay),
    0
  );
  const totalCbdPerDay = patient.dosingRegimens.reduce(
    (sum: number, r: any) => sum + (r.calculatedCbdMgPerDay ?? (r.calculatedCbdMgPerDose ?? 0) * r.frequencyPerDay),
    0
  );

  const nextVisit = patient.encounters.find((e: any) => e.status === "scheduled");
  const intakeComplete = patient.chartSummary?.completenessScore ?? 0;

  const latestMetric: Record<string, number> = {};
  for (const log of patient.outcomeLogs) {
    latestMetric[log.metric] = log.value;
  }
  const latestMood = latestMetric.mood;

  return (
    <FadeInWidget>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-6 md:mb-8">
      <PWASyncNextVisit visit={nextVisit} />
      {/* Cannabis Module */}
      <Card tone="glass">
        <CardContent className="py-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-4 flex items-center gap-1.5">
            <span className="text-sm">{"\uD83C\uDF3F"}</span>
            Cannabis intake
          </p>
          {patient.dosingRegimens.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <span className="font-display text-3xl text-accent tabular-nums font-medium">
                    {totalThcPerDay.toFixed(1)}
                  </span>
                  <p className="text-xs text-text-muted mt-0.5">mg THC/day</p>
                </div>
                <div className="text-center">
                  <span className="font-display text-3xl text-[color:var(--highlight)] tabular-nums font-medium">
                    {totalCbdPerDay.toFixed(1)}
                  </span>
                  <p className="text-xs text-text-muted mt-0.5">mg CBD/day</p>
                </div>
              </div>
              <p className="text-xs text-text-subtle">
                {patient.dosingRegimens.length} active regimen{patient.dosingRegimens.length > 1 ? "s" : ""}
              </p>
              <Link href="/portal/medications">
                <Button size="sm" variant="secondary" className="w-full">
                  View medications
                </Button>
              </Link>
            </div>
          ) : (
            <div>
              <p className="text-sm text-text-muted">No active cannabis regimen yet.</p>
              <Link href="/portal/medications#dosing-plan" className="mt-3 block">
                <Button size="sm" variant="secondary" className="w-full">
                  View dosing plan
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next Visit */}
      <Card tone="glass">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <LeafSprig size={14} className="text-accent/80" />
              Next visit
            </CardTitle>
            {nextVisit ? (
              <Badge tone="accent">Confirmed</Badge>
            ) : (
              <Badge tone="neutral">Not scheduled</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {nextVisit ? (
            <>
              <p className="font-display text-xl text-text tracking-tight">
                {formatDate(nextVisit.scheduledFor)}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge tone={nextVisit.modality === "video" ? "info" : "accent"}>
                  {nextVisit.modality === "video" ? "Video" : nextVisit.modality === "phone" ? "Phone" : "In-person"}
                </Badge>
              </div>
              {nextVisit.scheduledFor && (
                <p className="text-sm text-text-muted mt-2">
                  {new Date(nextVisit.scheduledFor).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  {" · "}{formatRelative(nextVisit.scheduledFor)}
                </p>
              )}
              <VisitActions
                encounterId={nextVisit.id}
                isConfirmed={!!(nextVisit as any).briefingContext?.patientConfirmedAt}
              />
            </>
          ) : (
            <p className="text-sm text-text-muted">
              Once intake is complete, we will help you schedule.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Chart readiness + Mood */}
      <Card tone="glass">
        <CardContent className="py-6 space-y-5">
          {/* Chart readiness */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                Chart readiness
              </p>
              <Badge tone={intakeComplete >= 80 ? "success" : "warning"}>
                {intakeComplete}%
              </Badge>
            </div>
            <div className="relative h-2 bg-surface-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-[#3A8560] rounded-full transition-all duration-700 ease-smooth"
                style={{ width: `${intakeComplete}%` }}
              />
            </div>
            <Link href="/portal/intake" className="block mt-2">
              <Button size="sm" variant="ghost" className="w-full text-xs">
                {intakeComplete >= 100 ? "Review intake" : "Continue intake"}
              </Button>
            </Link>
          </div>

          {/* Mood emoji */}
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">
              Current mood
            </p>
            <div className="flex items-center gap-2">
              {latestMood !== undefined ? (
                <>
                  <span className="text-3xl">
                    {latestMood >= 7 ? "\uD83D\uDE0A" : latestMood >= 4 ? "\uD83D\uDE10" : "\uD83D\uDE1E"}
                  </span>
                  <span className="text-sm text-text-muted">
                    {latestMood >= 7 ? "Feeling good" : latestMood >= 4 ? "Hanging in there" : "Tough day"}
                  </span>
                </>
              ) : (
                <span className="text-sm text-text-muted">Log a check-in to see your mood here</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </FadeInWidget>
  );
}

export function CannabisNextVisitMoodSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-6 md:mb-8 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-[180px] bg-gradient-to-b from-surface-muted to-surface-raised border border-border/40 rounded-2xl p-6 flex flex-col justify-between" />
      ))}
    </div>
  );
}

/* ===========================================================================
   5. PlantTasksWidget
   =========================================================================== */
export async function PlantTasksWidget({ userId }: { userId: string }) {
  const isDemo = isLocalDemoUserId(userId);
  const patient = await fetchPatientData(userId, {
    tasks: {
      where: { status: "open" },
      orderBy: { dueAt: "asc" },
      take: 5,
    },
  });

  if (!patient) return null;

  const plantHealth = isDemo
    ? LOCAL_DEMO_PLANT_HEALTH
    : await withTimeout(
        computePlantHealth(patient.id),
        PLANT_HEALTH_TIMEOUT_MS,
        {
          score: 40,
          stage: "growing",
          leafColor: "light-green",
          hasFlowers: false,
          stemCount: 2,
          leafCount: 4,
          healthFactors: [],
        },
        "widgets.computePlantHealth"
      );

  return (
    <FadeInWidget>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-6 md:mb-8">
        <PWASyncTasks tasks={patient.tasks} />
        {/* Plant companion */}
        <Link href="/portal/garden" className="block min-h-[44px] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background" aria-label="Open your virtual garden companion">
          <Card tone="glass" className="card-hover h-full">
            <CardContent className="flex items-center gap-5 py-5">
              <div className="shrink-0">
                <HealthPlant health={plantHealth} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
                  Your plant
                </p>
                <p className="font-display text-base text-text tracking-tight">
                  {STAGE_LABELS[plantHealth.stage]}
                </p>
                <p className="text-xs text-text-muted mt-1 leading-relaxed line-clamp-2">
                  {plantHealth.score >= 71
                    ? "Thriving — you\u2019ve been consistent."
                    : plantHealth.score >= 40
                      ? "Growing nicely. A few more check-ins would help."
                      : "Needs love. Try logging today."}
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Tasks */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Your next steps</CardTitle>
          </CardHeader>
          <CardContent>
            {patient.tasks.length === 0 ? (
              <p className="text-sm text-text-muted py-2">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y divide-border/70 -mx-4">
                {patient.tasks.slice(0, 3).map((task: any) => (
                  <li key={task.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="flex gap-2 min-w-0">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text">{task.title}</p>
                        {task.dueAt && (
                          <p className="text-xs text-text-subtle mt-0.5">Due {formatDate(task.dueAt)}</p>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary">Open</Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </FadeInWidget>
  );
}

export function PlantTasksSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-6 md:mb-8 animate-pulse">
      <div className="h-[120px] bg-gradient-to-r from-surface-muted to-surface-raised border border-border/40 rounded-2xl" />
      <div className="md:col-span-2 h-[120px] bg-gradient-to-r from-surface-muted to-surface-raised border border-border/40 rounded-2xl" />
    </div>
  );
}

/* ===========================================================================
   6. BadgeShowcaseWidget
   =========================================================================== */
export async function BadgeShowcaseWidget({ userId }: { userId: string }) {
  const patient = await fetchPatientData(userId, {
    patientBadges: {
      include: { badge: true },
      orderBy: { earnedAt: "desc" },
    },
  });

  if (!patient) return null;

  return (
    <FadeInWidget>
      <div className="mt-8">
      <BadgeShowcase 
        badges={
          patient.patientBadges?.map((pb: any) => ({
            id: pb.badge.id,
            name: pb.badge.name,
            description: pb.badge.description,
            tier: pb.badge.tier,
            earnedAt: pb.earnedAt.toISOString(),
          })) || []
        } 
      />
      </div>
    </FadeInWidget>
  );
}

export function BadgeShowcaseSkeleton() {
  return (
    <div className="mt-8 h-[160px] bg-gradient-to-r from-surface-muted to-surface-raised border border-border/40 rounded-2xl animate-pulse" />
  );
}
