import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { computeFourPillars, PILLAR_DEFS } from "@/lib/domain/four-pillars";
import { ShareButton } from "@/components/portal/share-button";
import { SHARE_PRESETS } from "@/lib/portal/social-share";

export const metadata = { title: "Four Pillars of Health" };

// ---------------------------------------------------------------------------
// EMR-093 — Four Pillars of Health
//
// A simple bar graph that scores Physical / Mental / Emotional / Spiritual
// wellness from 0–100 each. Each bar derives from real outcome / engagement
// data so the patient sees their own life reflected — not a vanity metric.
// ---------------------------------------------------------------------------

export default async function FourPillarsPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    include: {
      outcomeLogs: { orderBy: { loggedAt: "desc" }, take: 200 },
      messageThreads: { take: 5, orderBy: { lastMessageAt: "desc" } },
      encounters: { orderBy: { scheduledFor: "desc" }, take: 5 },
      doseLogs: { orderBy: { loggedAt: "desc" }, take: 60 },
    },
  });
  if (!patient) redirect("/portal/intake");

  const pillars = computeFourPillars({
    outcomeLogs: patient.outcomeLogs.map((l) => ({
      metric: l.metric,
      value: l.value,
      loggedAt: l.loggedAt,
    })),
    doseLogs: patient.doseLogs.map((l) => ({ loggedAt: l.loggedAt })),
    encounterCount: patient.encounters.length,
    messageThreadCount: patient.messageThreads.length,
  });

  const overall = Math.round(
    pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length,
  );

  return (
    <PageShell maxWidth="max-w-[920px]">
      <Card tone="ambient" className="mb-8 grain">
        <div className="relative z-10 px-6 md:px-10 py-8 md:py-12">
          <Eyebrow className="mb-3">Four Pillars of Health</Eyebrow>
          <h1 className="font-display text-3xl md:text-[2.5rem] text-text tracking-tight leading-[1.08]">
            Your wellness, in four shapes.
          </h1>
          <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-xl">
            Physical, mental, emotional, spiritual. Each bar is built from your
            own check-ins, visits, and daily practice. Stronger bars are better.
          </p>
          <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-3">
              <span className="font-display text-5xl text-accent tabular-nums">
                {overall}
              </span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-text-subtle">
                Overall pillar average
              </span>
            </div>
            <ShareButton milestone={SHARE_PRESETS.pillarStreak(overall)} />
          </div>
        </div>
      </Card>

      <Card>
        <CardContent className="py-8">
          <div className="grid grid-cols-1 gap-7" aria-label="Four pillars bar graph">
            {pillars.map((p) => (
              <PillarBar key={p.id} pillar={p} />
            ))}
          </div>
        </CardContent>
      </Card>

      <EditorialRule className="my-10" />

      <section className="grid gap-4 md:grid-cols-2">
        {pillars.map((p) => (
          <Card key={`${p.id}-detail`} tone="raised">
            <CardContent className="py-5">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl" aria-hidden="true">
                  {p.emoji}
                </span>
                <div>
                  <p className="font-display text-lg text-text">{p.label}</p>
                  <p className="text-xs text-text-subtle">{p.description}</p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {p.factors.map((f, i) => (
                  <li
                    key={i}
                    className="text-xs text-text-muted flex items-start gap-2"
                  >
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                        f.weight > 0
                          ? "bg-success"
                          : f.weight < 0
                            ? "bg-warning"
                            : "bg-border-strong"
                      }`}
                    />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
              {p.suggestion && (
                <p className="text-xs text-accent mt-3">{p.suggestion}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <p className="text-center text-xs text-text-subtle mt-10">
        See <Link href="/portal/lifestyle" className="text-accent hover:underline">your lifestyle toolkit</Link> for tips that move each bar.
      </p>
    </PageShell>
  );
}

function PillarBar({
  pillar,
}: {
  pillar: ReturnType<typeof computeFourPillars>[number];
}) {
  const def = PILLAR_DEFS.find((d) => d.id === pillar.id)!;
  const pct = Math.max(2, Math.min(100, pillar.score));
  return (
    <div data-pillar={pillar.id}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-text">
          <span aria-hidden="true">{pillar.emoji}</span>
          {pillar.label}
        </span>
        <span className="font-display text-xl text-text tabular-nums">
          {pillar.score}
          <span className="text-[10px] text-text-subtle ml-1">/ 100</span>
        </span>
      </div>
      <div
        className="h-4 rounded-full bg-surface-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pillar.score}
        aria-label={`${pillar.label} pillar score`}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${def.colorStart}, ${def.colorEnd})`,
          }}
        />
      </div>
    </div>
  );
}
