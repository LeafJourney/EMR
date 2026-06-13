import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkline } from "@/components/ui/sparkline";
import { Eyebrow, EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { SampleBadge } from "@/components/patient/sample-badge";
import {
  buildAchievements,
  consecutiveDayStreak,
  DEMO_WEARABLE_SUMMARY,
  type WearableSummary,
} from "@/lib/domain/achievements";
import { computePlantHealth } from "@/lib/domain/plant-health";
import { LIFESTYLE_DOMAINS, LIFESTYLE_TIPS } from "@/lib/domain/lifestyle";
import { LifestyleToolkit } from "../lifestyle/lifestyle-toolkit";

import { PlantCompanion } from "@/components/gamification/plant-companion";
import { HealthRings } from "@/components/gamification/health-rings";
import { HabitFormationCard } from "@/components/lifestyle/habit-formation-card";
import { SocialConnectivityCard } from "@/components/lifestyle/social-connectivity-card";

import { SleepHygieneCard } from "@/components/lifestyle/sleep-hygiene-card";
import { MealPlanCard } from "@/components/lifestyle/meal-plan-card";
import { ExerciseRegimenCard } from "@/components/lifestyle/exercise-regimen-card";
import { StressReductionCard } from "@/components/lifestyle/stress-reduction-card";

export const metadata = { title: "Wellness Hub" };

// EMR-161 — Unified Wellness Hub
//
// Three formerly-separate surfaces collapse here:
//   - /portal/achievements (already redirects to lifestyle; deprecate next)
//   - /portal/lifestyle    (the canonical wellness/tips surface)
//   - /portal/integrations (wearable connect screen)
//
// The hub leads with the data the patient earns and the data their
// devices already capture, then offers the lifestyle toolkit beneath.
// Three reasons we mount it at /portal/wellness rather than overwriting
// /portal/lifestyle:
//
//   1. /lifestyle is linked from PatientSectionNav and a half-dozen
//      onboarding emails. We keep it stable and ship the unified hub
//      under a new route the section-nav can be flipped to.
//   2. The hub mixes Apple Health / Google Fit shapes (steps, sleep,
//      HRV, mindful minutes). Those shapes deserve a dedicated page
//      that can grow into a multi-source dashboard.
//   3. Achievements are gamification chrome; pinning them next to the
//      wearable HRV reading reinforces "your effort and your devices
//      both count" without burying tips deeper.

interface WearableSourceShape {
  label: string;
  /** Apple Health = HKQuantityType samples; Google Fit = AggregateRequest. */
  shapeHint: string;
  summary: WearableSummary | null;
}

/**
 * Stand-in for a multi-source wearable fetch. Real implementation will
 * call our integrations service (HealthKit + Google Fit). Today we
 * surface the same demo summary the lifestyle page used so the UI
 * renders fully populated.
 */
function loadWearableSources(): WearableSourceShape[] {
  return [
    {
      label: "Apple Health",
      shapeHint: "HKQuantityType samples (stepCount, sleepAnalysis, restingHeartRate, mindfulSession)",
      summary: DEMO_WEARABLE_SUMMARY,
    },
    {
      label: "Google Fit",
      shapeHint: "AggregateRequest with com.google.step_count.delta + com.google.sleep.segment",
      summary: null,
    },
  ];
}

export default async function WellnessHubPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    include: {
      outcomeLogs: { orderBy: { loggedAt: "desc" }, take: 200 },
      messageThreads: { take: 1 },
      chartSummary: true,
      encounters: {
        orderBy: { scheduledFor: "desc" },
        take: 1,
        where: { status: "complete" },
      },
    },
  });
  if (!patient) redirect("/portal/intake");

  const plantHealth = await computePlantHealth(patient.id);
  const consecutiveDays = consecutiveDayStreak(
    patient.outcomeLogs.map((l) => l.loggedAt),
  );
  const uniqueMetrics = new Set(patient.outcomeLogs.map((l) => l.metric)).size;
  const lastVisit = patient.encounters[0]?.completedAt;
  const daysSinceLastVisit = lastVisit
    ? Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const achievements = buildAchievements({
    outcomeLogCount: patient.outcomeLogs.length,
    consecutiveDays,
    uniqueMetricsLogged: uniqueMetrics,
    daysSinceLastVisit,
    hasMessagedTeam: patient.messageThreads.length > 0,
    intakeComplete: patient.chartSummary?.completenessScore ?? 0,
  });
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const sources = loadWearableSources();
  const connectedSources = sources.filter((s) => s.summary !== null);

  // Outcome trend strip — 14-day pain/sleep/mood/anxiety mini-sparklines
  // so the patient sees biometrics + self-report side by side.
  const recent14 = patient.outcomeLogs.filter(
    (l) => Date.now() - l.loggedAt.getTime() < 14 * 86_400_000,
  );
  const metricSparks = (["pain", "sleep", "mood", "anxiety"] as const)
    .map((metric) => {
      const values = recent14
        .filter((l) => l.metric === metric)
        .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())
        .map((l) => l.value);
      return { metric, values };
    })
    .filter((m) => m.values.length >= 2);

  return (
    <PageShell maxWidth="max-w-[1040px]">
      <PatientSectionNav section="garden" />

      {/* Hero */}
      <Card tone="ambient" className="mb-8 grain">
        <div className="relative z-10 px-6 md:px-10 py-8 md:py-12">
          <Eyebrow className="mb-3">Wellness hub</Eyebrow>
          <h1 className="font-display text-3xl md:text-[2.5rem] text-text tracking-tight leading-[1.08]">
            Your effort, your data, in one place.
          </h1>
          <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-xl">
            Achievements you've earned, what your wearables saw today, and the
            lifestyle plays your care team recommends — all stitched together
            so the next move is obvious.
          </p>
        </div>
      </Card>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          emoji="\u{1F33F}"
          label="Plant health"
          value={`${plantHealth.score}`}
          hint={`${plantHealth.leafCount} leaves`}
        />
        <StatCard
          emoji="\u{1F525}"
          label="Streak"
          value={`${consecutiveDays}`}
          hint={consecutiveDays === 1 ? "day" : "days in a row"}
        />
        <StatCard
          emoji="\u{1F3C6}"
          label="Achievements"
          value={`${unlockedCount}/${achievements.length}`}
          hint="unlocked"
        />
        <StatCard
          emoji="\u{231A}"
          label="Connected devices"
          value={`${connectedSources.length}/${sources.length}`}
          hint="syncing today"
        />
      </div>

      {/* Today from your devices */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-3">
          <Eyebrow>From your devices</Eyebrow>
          <Link
            href="/portal/integrations"
            className="text-xs text-accent hover:underline"
          >
            Manage devices →
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {sources.map((src) => (
            <Card key={src.label} tone="raised">
              <CardContent className="py-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                      {src.label}
                    </p>
                    <p className="text-[10px] text-text-subtle leading-snug mt-0.5 max-w-xs">
                      {src.shapeHint}
                    </p>
                  </div>
                  {src.summary ? (
                    <SampleBadge />
                  ) : (
                    <Badge tone="neutral">Not connected</Badge>
                  )}
                </div>
                {src.summary ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <WearableMetric
                      label="Steps"
                      value={src.summary.steps.toLocaleString()}
                    />
                    <WearableMetric
                      label="Sleep"
                      value={`${src.summary.sleepHours}h`}
                    />
                    <WearableMetric
                      label="Resting HR"
                      value={`${src.summary.restingHeartRate} bpm`}
                    />
                    <WearableMetric
                      label="Mindful"
                      value={`${src.summary.mindfulMinutes} min`}
                    />
                  </div>
                ) : (
                  <Link
                    href="/portal/integrations"
                    className="text-sm text-accent hover:underline"
                  >
                    Connect {src.label} →
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Self-report trend strip */}
      {metricSparks.length > 0 && (
        <section className="mb-10">
          <Eyebrow className="mb-3">Last 14 days, in your own words</Eyebrow>
          <Card tone="raised">
            <CardContent className="py-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
                {metricSparks.map(({ metric, values }) => (
                  <div key={metric} className="flex items-center gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-text capitalize">
                        {metric}
                      </p>
                      <p className="font-display text-lg text-accent tabular-nums leading-tight">
                        {values[values.length - 1].toFixed(1)}
                      </p>
                    </div>
                    <Sparkline data={values} width={96} height={32} showDots={false} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Achievements */}
      <section className="mb-10">
        <Eyebrow className="mb-3">Your achievements</Eyebrow>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border p-4 transition-colors ${
                a.unlocked
                  ? "border-accent/40 bg-accent-soft/40"
                  : "border-border bg-surface-muted/40 opacity-70"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">
                  {a.emoji}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{a.title}</p>
                  <p className="text-xs text-text-subtle line-clamp-2">
                    {a.description}
                  </p>
                </div>
              </div>
              {a.progressLabel && !a.unlocked && (
                <p className="text-[10px] uppercase tracking-wider text-text-subtle mt-3">
                  {a.progressLabel}
                </p>
              )}
              {a.unlocked && (
                <Badge tone="success" className="mt-3 text-[10px]">
                  Unlocked
                </Badge>
              )}
            </div>
          ))}
        </div>
      </section>

      <EditorialRule className="mb-10" />

      {/* Gamification & Adherence */}
      <section className="mb-10">
        <Eyebrow className="mb-3">Gamification &amp; Adherence</Eyebrow>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PlantCompanion 
            stats={{
              level: plantHealth.leafCount >= 10 ? 3 : plantHealth.leafCount >= 5 ? 2 : 1,
              health: plantHealth.score,
              watered: consecutiveDays > 0,
              sunlight: Math.min(100, unlockedCount * 20)
            }}
          />
          <HealthRings 
            rings={{
              move: { value: sources[0]?.summary?.steps || 3000, max: 10000 },
              meds: { value: consecutiveDays > 0 ? 2 : 0, max: 2 },
              sleep: { value: sources[0]?.summary?.sleepHours || 6, max: 8 }
            }}
          />
        </div>
      </section>

      <EditorialRule className="mb-10" />

      {/* Structured Care Plans */}
      <section className="mb-10">
        <Eyebrow className="mb-3">Lifestyle Care Plans</Eyebrow>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SleepHygieneCard />
          <MealPlanCard />
          <ExerciseRegimenCard />
          <StressReductionCard />
          <HabitFormationCard />
          <SocialConnectivityCard />
        </div>
      </section>

      <EditorialRule className="mb-10" />

      {/* Lifestyle toolkit */}
      <section className="mb-10">
        <Eyebrow className="mb-3">Lifestyle toolkit</Eyebrow>
        <LifestyleToolkit domains={LIFESTYLE_DOMAINS} tips={LIFESTYLE_TIPS} />
      </section>

      <EditorialRule className="my-10" />

      <Card>
        <CardContent className="py-8 text-center">
          <p className="font-display text-xl text-text tracking-tight mb-2">
            Pick one. Start small.
          </p>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            One easy tip you actually do beats a perfect plan you never start.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2 text-accent/50">
            <LeafSprig size={16} />
            <span className="text-[11px] font-medium uppercase tracking-[0.16em]">
              One step at a time
            </span>
            <LeafSprig size={16} />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function StatCard({
  emoji,
  label,
  value,
  hint,
}: {
  emoji: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card tone="raised">
      <CardContent className="py-5 text-center">
        <span className="text-2xl block mb-1" aria-hidden="true">
          {emoji}
        </span>
        <p className="font-display text-2xl font-medium text-text tabular-nums">
          {value}
        </p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle mt-1">
          {label}
        </p>
        <p className="text-xs text-text-subtle mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

function WearableMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">
        {label}
      </p>
      <p className="font-display text-lg text-text tabular-nums">{value}</p>
    </div>
  );
}
