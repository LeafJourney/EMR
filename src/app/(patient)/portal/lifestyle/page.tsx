import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { EmptyState } from "@/components/ui/empty-state";
import { LifestyleEmptyIllustration } from "@/components/ui/empty-illustrations";
import { LIFESTYLE_DOMAINS, LIFESTYLE_TIPS } from "@/lib/domain/lifestyle";
import {
  buildAchievements,
  consecutiveDayStreak,
  DEMO_WEARABLE_SUMMARY,
} from "@/lib/domain/achievements";
import { computePlantHealth } from "@/lib/domain/plant-health";
import { MindfulnessCheckIn } from "@/components/portal/mindfulness-check-in";
import { LifestyleToolkit } from "./lifestyle-toolkit";
import { LifestyleTrends, type LifestyleTrendPoint } from "./lifestyle-trends";

export const metadata = { title: "Wellness Toolkit" };

// ---------------------------------------------------------------------------
// Wellness Toolkit — EMR-006 / EMR-138 / EMR-161 / EMR-191
// ---------------------------------------------------------------------------
// Replaces the old ribbon-tab lifestyle page with:
//  - health score + plant health summary
//  - mindfulness emoji check-in (EMR-138)
//  - achievement badges + streak (EMR-161 — merged from /achievements)
//  - wearable snapshot (EMR-161)
//  - checkbox dropdown domain cards (EMR-191)
// ---------------------------------------------------------------------------

export default async function LifestylePage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    include: {
      outcomeLogs: { orderBy: { loggedAt: "desc" }, take: 200 },
      messageThreads: { take: 1 },
      chartSummary: true,
      encounters: { orderBy: { scheduledFor: "desc" }, take: 1, where: { status: "complete" } },
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

  const totalTips = Object.values(LIFESTYLE_TIPS).reduce(
    (sum, tips) => sum + tips.length,
    0,
  );

  // Rolling 8-week outcome score (mean of all metric values logged that week).
  const trend: LifestyleTrendPoint[] = (() => {
    const weeks = 8;
    const now = Date.now();
    const buckets = new Array<{ sum: number; n: number }>(weeks)
      .fill({ sum: 0, n: 0 })
      .map(() => ({ sum: 0, n: 0 }));
    for (const log of patient.outcomeLogs) {
      const ageDays = Math.floor(
        (now - log.loggedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      const week = Math.floor(ageDays / 7);
      if (week < 0 || week >= weeks) continue;
      const bucket = buckets[weeks - 1 - week];
      bucket.sum += log.value;
      bucket.n += 1;
    }
    return buckets.map((b, i) => ({
      label: `W-${weeks - 1 - i}`,
      outcome: b.n > 0 ? Number((b.sum / b.n).toFixed(1)) : 0,
    }));
  })();

  // Daily check-in cadence (last ~16 weeks) for the heatmap.
  const activity = patient.outcomeLogs.map((l) => ({
    date: l.loggedAt,
    value: 1,
  }));

  return (
    <PageShell maxWidth="max-w-[1040px]">
      {/* Hero */}
      <Card tone="ambient" className="mb-8 grain">
        <div className="relative z-10 px-6 md:px-10 py-8 md:py-12">
          <Eyebrow className="mb-3">Wellness toolkit</Eyebrow>
          <h1 className="font-display text-3xl md:text-[2.5rem] text-text tracking-tight leading-[1.08]">
            Your toolkit, in one place.
          </h1>
          <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-xl">
            Lifestyle tips, mindfulness check-ins, achievements, and what your
            wearables said today — all stitched into your health score so the
            next move is obvious.
          </p>
        </div>
      </Card>

      {/* First-run empty state — shown until the patient has any outcome data */}
      {patient.outcomeLogs.length === 0 && (
        <div className="mb-8">
          <EmptyState
            illustration={<LifestyleEmptyIllustration />}
            title="Welcome — your toolkit is ready"
            description="Log how you feel just once and your plant starts growing, your streak begins, and the tips below sharpen to what actually helps you."
            primaryAction={
              <Link
                href="/portal/journal"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent/90 transition-colors"
              >
                Log how you feel
              </Link>
            }
            secondaryAction={
              <Link
                href="/portal/integrations"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:bg-surface-muted transition-colors"
              >
                Connect a wearable
              </Link>
            }
            tips={[
              "One check-in unlocks your first achievement",
              "Connecting Apple Health or Fitbit fills in steps, sleep, and HR automatically",
              "Pick a single tip below — small steps beat perfect plans",
            ]}
          />
        </div>
      )}

      {/* Stat row — health score + streak + achievements */}
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
          emoji="\u{1F4DA}"
          label="Tip library"
          value={`${totalTips}`}
          hint={`across ${LIFESTYLE_DOMAINS.length} domains`}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-[1.1fr,1fr] mb-10">
        {/* Mindfulness check-in (EMR-138) */}
        <MindfulnessCheckIn />

        {/* Wearable snapshot (EMR-161) */}
        <Card tone="raised">
          <CardContent className="py-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                Today from {DEMO_WEARABLE_SUMMARY.source}
              </p>
              <span className="text-2xl" aria-hidden="true">
                {DEMO_WEARABLE_SUMMARY.emoji}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <WearableMetric label="Steps" value={DEMO_WEARABLE_SUMMARY.steps.toLocaleString()} />
              <WearableMetric label="Sleep" value={`${DEMO_WEARABLE_SUMMARY.sleepHours}h`} />
              <WearableMetric label="Resting HR" value={`${DEMO_WEARABLE_SUMMARY.restingHeartRate} bpm`} />
              <WearableMetric label="Mindful" value={`${DEMO_WEARABLE_SUMMARY.mindfulMinutes} min`} />
            </div>
            <p className="mt-4 text-xs text-text-subtle">
              Manage devices in <a href="/portal/integrations" className="text-accent hover:underline">Integrations</a>.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trends band — branded chart wrappers (TrendArea / HeatmapWeek / ProgressDonut) */}
      {patient.outcomeLogs.length > 0 && (
        <LifestyleTrends
          trend={trend}
          activity={activity}
          unlockedCount={unlockedCount}
          totalAchievements={achievements.length}
        />
      )}

      {/* Achievements grid (EMR-161) */}
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
                  <p className="text-xs text-text-subtle line-clamp-2">{a.description}</p>
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

      {/* Domain cards as checkbox dropdowns (EMR-191) */}
      <LifestyleToolkit
        domains={LIFESTYLE_DOMAINS}
        tips={LIFESTYLE_TIPS}
      />

      <EditorialRule className="my-10" />

      {/* Deeper tracking surfaces — pillars, spiritual, recipes */}
      <section className="grid gap-4 md:grid-cols-3">
        <LifestyleLink
          href="/portal/lifestyle/pillars"
          emoji="\u{1F4CA}"
          title="Four Pillars"
          description="Physical, mental, emotional, spiritual — all on one chart."
        />
        <LifestyleLink
          href="/portal/lifestyle/spiritual"
          emoji="\u{1F54A}\u{FE0F}"
          title="Spiritual"
          description="Faith, charity, family, meditation, nature — weekly check-in."
        />
        <LifestyleLink
          href="/portal/lifestyle/recipes"
          emoji="\u{1F374}"
          title="Cannabis kitchen"
          description="Mediterranean, Ayurvedic, Mexican, Italian, vegan, keto."
        />
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
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">{label}</p>
      <p className="font-display text-lg text-text tabular-nums">{value}</p>
    </div>
  );
}

function LifestyleLink({
  href,
  emoji,
  title,
  description,
}: {
  href: string;
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-surface-raised p-5 hover:border-accent/50 hover:shadow-sm transition-all"
    >
      <span className="text-3xl block mb-2" aria-hidden="true">
        {emoji}
      </span>
      <p className="font-display text-lg text-text">{title}</p>
      <p className="text-sm text-text-muted leading-relaxed mt-1">
        {description}
      </p>
    </Link>
  );
}
