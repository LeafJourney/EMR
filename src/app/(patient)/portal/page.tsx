import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricTile } from "@/components/ui/metric-tile";
import { Sparkline } from "@/components/ui/sparkline";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";
import { HealthPlant } from "@/components/ui/health-plant";
import { VisitActions } from "@/components/portal/visit-actions";
import { ContinuePanel } from "@/components/portal/continue-panel";
import { computePlantHealth, STAGE_LABELS, type PlantHealth } from "@/lib/domain/plant-health";
import { isLocalDemoUserId } from "@/lib/auth/local-demo";
import { buildLocalDemoPortalPatient, LOCAL_DEMO_PLANT_HEALTH } from "@/lib/domain/patient-portal-demo";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { OnboardingTour } from "@/components/ui/onboarding-tour";
import { WellnessTipWidget } from "@/components/ui/wellness-tip-widget";
import { QuickSymptomFab } from "@/components/ui/quick-symptom-fab";
import { VitalsCard } from "@/components/patient/vitals-card";
import { HealthRoadmap } from "@/components/patient/health-roadmap";
import { PositiveInputPrompt } from "@/components/patient/positive-input-prompt";
import { DicomViewer } from "@/components/dicom/dicom-viewer";
import { withTimeout } from "@/lib/utils/with-timeout";
import { FadeInWidget, StaggerContainer, FadeInItem } from "@/components/ui/fade-in-widget";
import { StreakFlame } from "@/components/portal/streak-flame";
import { HealthRings } from "@/components/portal/health-rings";
import { FreezeTokenStore } from "@/components/portal/freeze-token-store";
import { applyFreezeTokenAction } from "@/app/(patient)/portal/apply-freeze-action";
import { BadgeShowcase, type BadgeData } from "@/components/portal/badge-showcase";

// EMR-205: guard the home-page queries so a hung downstream call can
// never wedge the Suspense boundary again. Tight timeouts give the user
// fast feedback (retry UI) instead of an endless skeleton.
const PATIENT_QUERY_TIMEOUT_MS = 5_000;
const PLANT_HEALTH_TIMEOUT_MS = 2_000;

const DEFAULT_PLANT_HEALTH: PlantHealth = {
  score: 40,
  stage: "growing",
  leafColor: "light-green",
  hasFlowers: false,
  stemCount: 2,
  leafCount: 4,
  healthFactors: [],
};

export const metadata = { title: "Home" };

// ---------------------------------------------------------------------------
// EMR-13 / EMR-186: Patient Modular Dashboard
// ---------------------------------------------------------------------------
// Modular dashboard with: health grade, lifestyle bars, lab snapshots,
// AI tips, mood, cannabis module, appointments, tasks, messages.
// ---------------------------------------------------------------------------

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
  let score = 50; // baseline

  // Outcome average (0-10 where context matters)
  if (data.outcomeAvg !== null) {
    score += Math.round((10 - data.outcomeAvg) * 2); // lower pain/anxiety = higher score
  }

  // Intake completeness
  score += Math.round(data.intakeComplete * 0.15);

  // Recent visit
  if (data.hasRecentVisit) score += 10;

  // Adherence
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

export default async function PatientHome() {
  const user = await requireRole("patient");
  const isLocalDemo = isLocalDemoUserId(user.id);

  // Sentinel: the string "TIMEOUT" distinguishes a hung query from a
  // genuinely missing patient record, so we don't mis-route to intake.
  // `any` here because the TIMEOUT sentinel widens the resolved type and
  // the surrounding code already handles null vs. not-null.
  // EMR-205: `encounters` uses a narrow `select` to avoid pulling
  // Encounter.* (which references `chartingCompletedAt` — a column that
  // may be missing from prod DBs where the migration hasn't run yet).
  // Keeping the field list minimal also makes this query less likely
  // to time out on slow connections.
  const patient: any = isLocalDemo
    ? buildLocalDemoPortalPatient()
    : await withTimeout<any>(
      prisma.patient.findUnique({
        where: { userId: user.id },
        include: {
          chartSummary: true,
          outcomeLogs: { orderBy: { loggedAt: "asc" }, take: 100 },
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
          tasks: {
            where: { status: "open" },
            orderBy: { dueAt: "asc" },
            take: 5,
          },
          messageThreads: {
            orderBy: { lastMessageAt: "desc" },
            take: 1,
            include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
          },
          dosingRegimens: {
            where: { active: true },
            include: { product: true },
          },
          dailyStreak: true,
          freezeTokens: {
            where: { isUsed: false },
          },
          patientBadges: {
            include: { badge: true },
            orderBy: { earnedAt: "desc" },
          },
        },
      }).catch((err) => {
        console.warn("[portal.home] patient.findUnique rejected:", err);
        return "TIMEOUT";
      }),
      PATIENT_QUERY_TIMEOUT_MS,
      "TIMEOUT",
      "portal.home.patient.findUnique",
    );

  if (patient === "TIMEOUT") {
    return (
      <PageShell maxWidth="max-w-[1040px]">
        <div className="py-16 text-center">
          <Eyebrow className="mb-4 justify-center">Taking a moment</Eyebrow>
          <h1 className="font-display text-2xl md:text-3xl text-text tracking-tight mb-3">
            Your dashboard is loading slowly.
          </h1>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed mb-8">
            We couldn&apos;t fetch your chart in time. This is almost always a
            temporary network hiccup — please retry.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/portal">
              <Button size="lg">Retry</Button>
            </Link>
            <Link href="/portal/garden">
              <Button size="lg" variant="secondary">Go to My Garden</Button>
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!patient) {
    return (
      <PageShell maxWidth="max-w-[1040px]">
        <div className="py-24 text-center">
          <Eyebrow className="mb-4 justify-center">Welcome</Eyebrow>
          <h1 className="font-display text-2xl md:text-3xl text-text tracking-tight mb-3">
            Your account is created.
          </h1>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed mb-8">
            We couldn't find an active patient record linked to your email. If you are a patient, please use the invitation link sent by your clinic. If you are a staff member or administrator, please navigate to your console.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/admin">
              <Button size="lg">Go to Admin Console</Button>
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  const plantHealth = isLocalDemo
    ? LOCAL_DEMO_PLANT_HEALTH
    : await withTimeout(
      computePlantHealth(patient.id),
      PLANT_HEALTH_TIMEOUT_MS,
      DEFAULT_PLANT_HEALTH,
      "portal.home.computePlantHealth",
    );

  // Build metric series
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
  const latestAnxiety = latestMetric.anxiety;
  const latestMood = latestMetric.mood;
  const latestEnergy = latestMetric.energy;
  const latestAdherence = latestMetric.adherence;

  const nextVisit = patient.encounters.find((e: any) => e.status === "scheduled");
  const recentVisit = patient.encounters.find((e: any) => e.status === "complete");
  const intakeComplete = patient.chartSummary?.completenessScore ?? 0;

  // Compute overall outcome average (for pain, anxiety — lower is better)
  const negMetrics = [latestPain, latestAnxiety].filter((v): v is number => v !== undefined);
  const outcomeAvg = negMetrics.length > 0
    ? negMetrics.reduce((a, b) => a + b, 0) / negMetrics.length
    : null;

  const healthGrade = computeHealthGrade({
    outcomeAvg,
    intakeComplete,
    hasRecentVisit: !!recentVisit,
    adherenceScore: latestAdherence ?? null,
  });

  // Cannabis daily totals
  const totalThcPerDay = patient.dosingRegimens.reduce(
    (sum: number, r: any) => sum + (r.calculatedThcMgPerDay ?? (r.calculatedThcMgPerDose ?? 0) * r.frequencyPerDay),
    0
  );
  const totalCbdPerDay = patient.dosingRegimens.reduce(
    (sum: number, r: any) => sum + (r.calculatedCbdMgPerDay ?? (r.calculatedCbdMgPerDose ?? 0) * r.frequencyPerDay),
    0
  );

  const healthTips = generateHealthTips({
    latestPain,
    latestSleep,
    latestAnxiety,
    latestMood,
    hasRegimen: patient.dosingRegimens.length > 0,
  });

  const todayStr = new Date().toISOString().split("T")[0];
  const currentStreak = patient.dailyStreak?.currentStreak ?? 0;
  const longestStreak = patient.dailyStreak?.longestStreak ?? 0;
  const hasCheckedInToday = patient.dailyStreak?.lastCheckInDate === todayStr;

  return (
    <PageShell maxWidth="max-w-[1040px]">
      <OnboardingTour />
      <QuickSymptomFab />
      {/* ── Hero greeting ────────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl md:rounded-3xl liquid-glass-strong mb-6 md:mb-8">
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

      <ContinuePanel />

      {/* ── Symptom sparklines (kept above the fold per EMR-193) ── */}
      <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6 md:mb-8">
        <FadeInItem><MetricTile label="Pain" accent="forest" value={latestPain !== undefined ? latestPain.toFixed(1) : "—"} hint="0-10 scale" /></FadeInItem>
        <FadeInItem><MetricTile label="Sleep" accent="amber" value={latestSleep !== undefined ? latestSleep.toFixed(1) : "—"} hint="0-10 scale" /></FadeInItem>
        <FadeInItem className="bg-surface-raised border border-border rounded-xl p-4 shadow-sm">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">Pain trend</p>
          <Sparkline data={painSeries.length > 1 ? painSeries : [3, 4, 4, 3, 3, 2]} width={180} height={44} />
        </FadeInItem>
        <FadeInItem className="bg-surface-raised border border-border rounded-xl p-4 shadow-sm">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">Sleep trend</p>
          <Sparkline data={sleepSeries.length > 1 ? sleepSeries : [5, 5, 6, 6, 7, 7]} width={180} height={44} />
        </FadeInItem>
      </StaggerContainer>

      {/* ── Daily Vitals ── */}
      <div className="mb-6 md:mb-8">
        <VitalsCard vitals={{ heartRate: 72, bloodPressureSys: 120, bloodPressureDia: 80, respiratoryRate: 16, oxygenSaturation: 98, temperature: 98.6, lastUpdated: "Today at 9:00 AM" }} />
      </div>

      {/* ── Top row: Health grade + Lifestyle bars + AI tips ── */}
      <StaggerContainer className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 mb-6 md:mb-8">
        {/* Health Rings */}
        <FadeInItem className="md:col-span-3 h-full">
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
        </FadeInItem>

        {/* Lifestyle Bars */}
        <FadeInItem className="md:col-span-5 h-full">
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
        </FadeInItem>

        {/* AI Tips */}
        <FadeInItem className="md:col-span-4 h-full">
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
        </FadeInItem>
      </StaggerContainer>

      {/* ── Second row: Cannabis module + Next visit + Mood ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-6 md:mb-8">
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


      {/* ── Wellness tip of the day ────────── */}
      <div className="mb-6 md:mb-8">
        <WellnessTipWidget />
      </div>

      {/* ── Fourth row: Plant + Tasks + Message ────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5 mb-6 md:mb-8">
        {/* Plant companion */}
        <Link href="/portal/garden" className="block min-h-[44px]">
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

      {/* ── High-Level Health Roadmap ── */}
      <div className="mb-6 md:mb-8">
        <HealthRoadmap />
      </div>

      {/* ── Recent Imaging (DICOM Viewer) ── */}
      <div className="mb-6 md:mb-8">
        <Eyebrow className="mb-3">Recent Scan</Eyebrow>
        <DicomViewer 
          image={{
            id: "scan-123",
            name: "LUMBAR SPINE MRI",
            date: "Oct 24, 2023",
            modality: "MRI",
            imageUrl: "" // empty URL shows the radar mock
          }} 
        />
      </div>

      {/* ── Progress (goals, streaks, efficacy, recap) ── */}
      <div className="mb-3 mt-2">
        <Eyebrow>Your progress</Eyebrow>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 md:mb-8">
        <Link href="/portal/goals" className="min-h-[44px]">
          <Card tone="ambient" className="card-hover text-center py-5">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">🎯</span>
              <p className="text-sm font-medium text-text">Goals</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/streaks" className="min-h-[44px]">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">🔥</span>
              <p className="text-sm font-medium text-text">Streak</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/efficacy" className="min-h-[44px]">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">💚</span>
              <p className="text-sm font-medium text-text">Product efficacy</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/weekly-recap" className="min-h-[44px]">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">📰</span>
              <p className="text-sm font-medium text-text">Weekly recap</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Quick links ──────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link href="/portal/storybook" className="min-h-[44px]">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">{"\uD83D\uDCD6"}</span>
              <p className="text-sm font-medium text-text">My Storybook</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/education" className="min-h-[44px]">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">{"\uD83D\uDCDA"}</span>
              <p className="text-sm font-medium text-text">Care Guide</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/roadmap" className="min-h-[44px]">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">{"\uD83D\uDDFA\uFE0F"}</span>
              <p className="text-sm font-medium text-text">Roadmap</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/portal/medications/explainer" className="min-h-[44px]">
          <Card tone="ambient" className="card-hover text-center py-5 h-full">
            <CardContent className="py-0">
              <span className="text-2xl block mb-2">{"\uD83D\uDC8A"}</span>
              <p className="text-sm font-medium text-text">Med Explainer</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* ── Check-in Prompt ── */}
      <div className="mt-8 mb-4">
        <PositiveInputPrompt />
      </div>

      {/* ── Badges ── */}
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
    </PageShell>
  );
}
