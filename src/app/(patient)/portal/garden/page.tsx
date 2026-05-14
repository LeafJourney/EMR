import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { HealthPlant } from "@/components/ui/health-plant";
import {
  computePlantHealth,
  STAGE_LABELS,
  STAGE_DESCRIPTIONS,
  STAGE_ENCOURAGEMENT,
} from "@/lib/domain/plant-health";
import {
  GROW_GUIDE_STAGES,
  GROW_COMMUNITY_THREADS,
  STRAIN_DATABASE,
  PHOTO_JOURNAL_DEMO,
  HARVEST_LOG_DEMO,
  summarizeHarvestLog,
  strainById,
  type GrowGuideStage,
  type GrowCommunityThread,
  type Strain,
  type PhotoJournalEntry,
  type HarvestLogEntry,
} from "@/lib/lifestyle/grow-guide";
import { ShareButton } from "@/components/portal/share-button";
import { SHARE_PRESETS } from "@/lib/portal/social-share";

export const metadata = { title: "My Garden" };

export default async function GardenPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, firstName: true },
  });

  if (!patient) {
    redirect("/portal/intake");
  }

  const health = await computePlantHealth(patient.id);

  const positiveFactors = health.healthFactors.filter(
    (f) => f.status === "positive",
  );
  const neutralFactors = health.healthFactors.filter(
    (f) => f.status === "neutral",
  );
  const negativeFactors = health.healthFactors.filter(
    (f) => f.status === "negative",
  );

  return (
    <PageShell maxWidth="max-w-[860px]">
      <PatientSectionNav section="journey" />
      {/* ---- Hero section ---- */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised ambient mb-10">
        <div className="relative flex flex-col items-center text-center px-8 py-14 md:py-20">
          <Eyebrow className="mb-6">Your garden</Eyebrow>

          <HealthPlant health={health} size="lg" />

          <h1 className="font-display text-3xl md:text-4xl leading-[1.1] tracking-tight text-text mt-8">
            {STAGE_LABELS[health.stage]}
          </h1>
          <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-md">
            {STAGE_DESCRIPTIONS[health.stage]}
          </p>

          {/* Score badge */}
          <div className="mt-5 flex items-center gap-3">
            <Badge
              tone={
                health.score >= 71
                  ? "success"
                  : health.score >= 40
                    ? "accent"
                    : "warning"
              }
            >
              Health score: {health.score}
            </Badge>
            <Badge tone="neutral">{health.leafCount} leaves</Badge>
            {health.hasFlowers && (
              <Badge tone="highlight">Blooming</Badge>
            )}
          </div>

          {/* Encouragement */}
          <p className="text-sm text-text-subtle mt-4 italic max-w-sm">
            {STAGE_ENCOURAGEMENT[health.stage]}
          </p>

          {/* Social share (EMR-075) */}
          <div className="mt-5">
            <ShareButton milestone={SHARE_PRESETS.plantHealth(health.score)} />
          </div>
        </div>
      </section>

      <EditorialRule className="mb-10" />

      {/* ---- Health factors ---- */}
      <section className="mb-10">
        <h2 className="font-display text-xl text-text tracking-tight mb-6">
          What&apos;s helping your plant grow
        </h2>

        {positiveFactors.length > 0 ? (
          <div className="grid gap-3 mb-6">
            {positiveFactors.map((f) => (
              <FactorRow key={f.label} factor={f} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted mb-6">
            No positive factors yet. Start by logging how you feel today.
          </p>
        )}

        {(neutralFactors.length > 0 || negativeFactors.length > 0) && (
          <>
            <h2 className="font-display text-xl text-text tracking-tight mb-6 mt-8">
              Where your plant needs attention
            </h2>
            <div className="grid gap-3">
              {negativeFactors.map((f) => (
                <FactorRow key={f.label} factor={f} />
              ))}
              {neutralFactors.map((f) => (
                <FactorRow key={f.label} factor={f} />
              ))}
            </div>
          </>
        )}
      </section>

      <EditorialRule className="mb-10" />

      {/* ---- Tips ---- */}
      <section className="mb-10">
        <h2 className="font-display text-xl text-text tracking-tight mb-6">
          Ways to help your plant grow
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TipCard
            title="Log a check-in"
            description="Tell us how you're feeling. Pain, sleep, mood — even a quick entry makes a difference."
            href="/portal/outcomes"
            cta="Log now"
          />
          <TipCard
            title="Complete an assessment"
            description="Structured questionnaires help your care team fine-tune your plan."
            href="/portal/assessments"
            cta="Take assessment"
          />
          <TipCard
            title="Message your team"
            description="A quick note to your care team counts as tending to your health."
            href="/portal/messages"
            cta="Send message"
          />
          <TipCard
            title="Finish your intake"
            description="A complete chart gives your plant deeper roots and stronger stems."
            href="/portal/intake"
            cta="Continue intake"
          />
        </div>
      </section>

      <EditorialRule className="mb-10" />

      {/* ---- Cannabis grow guide (EMR-130) ---- */}
      <section className="mb-10">
        <Eyebrow className="mb-3">Grow your own</Eyebrow>
        <h2 className="font-display text-xl text-text tracking-tight mb-2">
          Cannabis grow guide
        </h2>
        <p className="text-sm text-text-muted leading-relaxed mb-6 max-w-xl">
          Many patients save money and tailor their dose by growing at home where
          legal. Each stage below shows what your plant needs that week.
        </p>
        <div className="grid gap-3">
          {GROW_GUIDE_STAGES.map((stage) => (
            <GrowStageCard key={stage.id} stage={stage} />
          ))}
        </div>
      </section>

      <EditorialRule className="mb-10" />

      {/* ---- Strain database (EMR-130 V3) ---- */}
      <section className="mb-10">
        <Eyebrow className="mb-3">Pick your strain</Eyebrow>
        <h2 className="font-display text-xl text-text tracking-tight mb-2">
          Strain database
        </h2>
        <p className="text-sm text-text-muted leading-relaxed mb-6 max-w-xl">
          Strains chosen for what patients actually use them for — sleep,
          daytime pain, anxiety, focus. Pick one that matches your goal, not
          the highest THC.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {STRAIN_DATABASE.map((strain) => (
            <StrainCard key={strain.id} strain={strain} />
          ))}
        </div>
      </section>

      <EditorialRule className="mb-10" />

      {/* ---- Photo journal (EMR-130 V3) ---- */}
      <section className="mb-10">
        <Eyebrow className="mb-3">Photo journal</Eyebrow>
        <h2 className="font-display text-xl text-text tracking-tight mb-2">
          Watch the plant change
        </h2>
        <p className="text-sm text-text-muted leading-relaxed mb-6 max-w-xl">
          Snap one photo per week. Patterns show up faster than you expect —
          height, color, when the trichomes turn cloudy.
        </p>
        <div className="grid gap-3">
          {PHOTO_JOURNAL_DEMO.map((entry) => (
            <PhotoJournalRow key={entry.id} entry={entry} />
          ))}
        </div>
      </section>

      <EditorialRule className="mb-10" />

      {/* ---- Harvest log (EMR-130 V3) ---- */}
      <section className="mb-10">
        <Eyebrow className="mb-3">Harvest log</Eyebrow>
        <HarvestSummary entries={HARVEST_LOG_DEMO} />
        <div className="grid gap-3 mt-5">
          {HARVEST_LOG_DEMO.map((entry) => (
            <HarvestLogRow key={entry.id} entry={entry} />
          ))}
        </div>
      </section>

      <EditorialRule className="mb-10" />

      {/* ---- Grower community (EMR-130) ---- */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-text tracking-tight">
            Grower community
          </h2>
          <Link href="/portal/community" className="text-xs text-accent hover:underline">
            See all threads
          </Link>
        </div>
        <p className="text-sm text-text-muted leading-relaxed mb-5">
          Other patients sharing what worked, what failed, and what they wish they
          knew earlier.
        </p>
        <div className="grid gap-3">
          {GROW_COMMUNITY_THREADS.map((thread) => (
            <CommunityThreadRow key={thread.id} thread={thread} />
          ))}
        </div>
      </section>

      {/* ---- Back to portal ---- */}
      <div className="flex justify-center">
        <Link href="/portal">
          <Button variant="secondary">Back to home</Button>
        </Link>
      </div>
    </PageShell>
  );
}

function GrowStageCard({ stage }: { stage: GrowGuideStage }) {
  return (
    <details className="group rounded-xl border border-border bg-surface-raised shadow-sm overflow-hidden">
      <summary className="flex items-center gap-4 px-4 py-3 cursor-pointer list-none">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xl"
          aria-hidden="true"
        >
          {stage.emoji}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-text">{stage.label}</p>
            <Badge tone="neutral" className="text-[10px]">
              {stage.durationDays}
            </Badge>
          </div>
          <p className="text-xs text-text-muted mt-0.5 line-clamp-1">
            {stage.blurb}
          </p>
        </div>
        <span
          className="text-text-subtle text-xs transition-transform group-open:rotate-90"
          aria-hidden="true"
        >
          {"▶"}
        </span>
      </summary>
      <div className="px-5 pb-5 pt-1 text-sm text-text-muted leading-relaxed space-y-3 border-t border-border/60">
        <GrowDetail label="Watering" body={stage.watering} />
        <GrowDetail label="Light" body={stage.light} />
        <GrowDetail label="Feeding" body={stage.feeding} />
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
            Watch for
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {stage.watchFor.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}

function GrowDetail({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
        {label}
      </p>
      <p>{body}</p>
    </div>
  );
}

function StrainCard({ strain }: { strain: Strain }) {
  const tone =
    strain.category === "cbd-dominant"
      ? "success"
      : strain.category === "indica"
        ? "highlight"
        : strain.category === "sativa"
          ? "info"
          : "accent";
  return (
    <div className="rounded-xl border border-border bg-surface-raised shadow-sm px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-sm font-medium text-text">{strain.name}</p>
        <Badge tone={tone} className="text-[10px] capitalize shrink-0">
          {strain.category.replace("-", " ")}
        </Badge>
      </div>
      <p className="text-[11px] text-text-subtle mb-2">
        THC {strain.thcRange} · CBD {strain.cbdRange} · {strain.floweringWeeks} wk flower · {strain.difficulty}
      </p>
      <p className="text-xs text-text-muted leading-relaxed mb-2">{strain.notes}</p>
      <div className="flex flex-wrap gap-1">
        {strain.helpsWith.map((h) => (
          <Badge key={h} tone="neutral" className="text-[10px]">
            {h}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function PhotoJournalRow({ entry }: { entry: PhotoJournalEntry }) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-border bg-surface-raised shadow-sm px-4 py-3">
      <div
        className="h-16 w-16 shrink-0 rounded-lg bg-accent-soft flex items-center justify-center text-2xl"
        aria-hidden="true"
      >
        {entry.stage === "seedling"
          ? "🌱"
          : entry.stage === "vegetative"
            ? "🌿"
            : entry.stage === "flowering"
              ? "🌸"
              : entry.stage === "harvest"
                ? "✂️"
                : "🫙"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <Badge tone="accent" className="text-[10px] capitalize">
            {entry.stage}
          </Badge>
          <span className="text-[11px] text-text-subtle">{entry.takenAt}</span>
        </div>
        <p className="text-sm text-text leading-relaxed">{entry.caption}</p>
        {entry.measurements && (
          <p className="text-[11px] text-text-subtle mt-1">
            {entry.measurements.heightInches != null
              ? `${entry.measurements.heightInches}″`
              : null}
            {entry.measurements.phReading != null
              ? ` · pH ${entry.measurements.phReading}`
              : null}
            {entry.measurements.tempF != null
              ? ` · ${entry.measurements.tempF}°F`
              : null}
            {entry.measurements.humidityPct != null
              ? ` · ${entry.measurements.humidityPct}% RH`
              : null}
          </p>
        )}
      </div>
    </div>
  );
}

function HarvestSummary({ entries }: { entries: HarvestLogEntry[] }) {
  const summary = summarizeHarvestLog(entries);
  const best = summary.bestStrainId ? strainById(summary.bestStrainId) : null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <SummaryTile label="Total dry" value={`${summary.totalDryGrams}g`} />
      <SummaryTile label="Avg rating" value={`${summary.averageRating}/5`} />
      <SummaryTile label="Strains" value={String(summary.uniqueStrains)} />
      <SummaryTile label="Top strain" value={best?.name ?? "—"} />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised shadow-sm px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-text-subtle">{label}</p>
      <p className="font-display text-lg text-text mt-1">{value}</p>
    </div>
  );
}

function HarvestLogRow({ entry }: { entry: HarvestLogEntry }) {
  const strain = strainById(entry.strainId);
  return (
    <div className="rounded-xl border border-border bg-surface-raised shadow-sm px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-sm font-medium text-text">{strain?.name ?? entry.strainId}</p>
        <Badge tone="accent" className="text-[10px] shrink-0">
          {"★".repeat(entry.rating)}
          {"☆".repeat(Math.max(0, 5 - entry.rating))}
        </Badge>
      </div>
      <p className="text-[11px] text-text-subtle mb-2">
        Harvested {entry.harvestedAt} · {entry.dryGrams}g dry · {entry.cureWeeks} wk cure
      </p>
      <p className="text-xs text-text-muted leading-relaxed">{entry.notes}</p>
    </div>
  );
}

function CommunityThreadRow({ thread }: { thread: GrowCommunityThread }) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised shadow-sm px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="text-sm font-medium text-text">{thread.title}</p>
        <Badge tone={thread.tag === "general" ? "neutral" : "accent"} className="text-[10px] shrink-0">
          {thread.tag}
        </Badge>
      </div>
      <p className="text-xs text-text-muted mb-2 line-clamp-2">
        {thread.preview}
      </p>
      <div className="flex items-center justify-between text-[11px] text-text-subtle">
        <span>
          {thread.author} <span className="text-accent">·</span> {thread.authorBadge}
        </span>
        <span>
          {thread.replies} replies <span className="text-accent">·</span> {thread.lastActive}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FactorRow({
  factor,
}: {
  factor: { label: string; status: "positive" | "neutral" | "negative"; detail: string };
}) {
  const badgeTone =
    factor.status === "positive"
      ? "success"
      : factor.status === "negative"
        ? "warning"
        : "neutral";

  const icon =
    factor.status === "positive"
      ? "\u2714" // checkmark
      : factor.status === "negative"
        ? "\u25CB" // circle
        : "\u2014"; // em dash

  return (
    <div className="flex items-start gap-4 bg-surface-raised border border-border rounded-xl p-4 shadow-sm">
      <span
        className={cn(
          "mt-0.5 text-sm shrink-0",
          factor.status === "positive" && "text-success",
          factor.status === "negative" && "text-[color:var(--warning)]",
          factor.status === "neutral" && "text-text-subtle",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-text">{factor.label}</p>
          <Badge tone={badgeTone} className="text-[10px]">
            {factor.status}
          </Badge>
        </div>
        <p className="text-sm text-text-muted mt-1 leading-relaxed">
          {factor.detail}
        </p>
      </div>
    </div>
  );
}

function TipCard({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card tone="raised" className="card-hover">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-muted leading-relaxed mb-4">
          {description}
        </p>
        <Link href={href}>
          <Button size="sm" variant="secondary">
            {cta}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

