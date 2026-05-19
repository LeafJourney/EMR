import Link from "next/link";
import type { OnboardingFunnelStage } from "../types";
import { formatCount, formatHumanDurationHours } from "./format";

// median time-in-stage is derived from createdAt and (for published) publishedAt;
// time on the *current* stage isn't logged yet — refine when a transition
// table lands.

const STAGE_ORDER = ["draft", "in_progress", "published"] as const;
const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  published: "Published",
};

function stageColor(status: string): string {
  if (status === "published") return "#27AE60";
  if (status === "in_progress") return "#2F80ED";
  return "#9B51E0";
}

export function OnboardingFunnel({ stages }: { stages: OnboardingFunnelStage[] }) {
  const byStatus = new Map(stages.map((s) => [s.status, s]));
  const ordered = STAGE_ORDER.map(
    (k) =>
      byStatus.get(k) ?? {
        status: k,
        count: 0,
        medianHoursInStage: 0,
        stuckCount: 0,
      },
  );
  const total = ordered.reduce((a, s) => a + s.count, 0);

  if (total === 0) {
    return (
      <div className="py-6">
        <p className="text-sm text-text">No practices in onboarding yet.</p>
        <p className="mt-1.5 text-[12px] text-text-muted leading-snug max-w-md">
          Each practice configuration progresses through draft, in-progress, and published stages.
          The funnel chart appears here once the first one is created.
        </p>
        <Link
          href="/onboarding"
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded"
        >
          Start onboarding a practice <span aria-hidden="true">→</span>
        </Link>
      </div>
    );
  }

  const maxCount = Math.max(1, ...ordered.map((s) => s.count));
  const W = 600;
  const H = 110;
  const gap = 16;
  const blockW = (W - gap * (ordered.length - 1)) / ordered.length;

  return (
    <div className="space-y-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Onboarding funnel"
        className="w-full h-[110px]"
      >
        {ordered.map((stage, i) => {
          const ratio = stage.count / maxCount;
          const blockH = Math.max(24, H * ratio);
          const x = i * (blockW + gap);
          const y = (H - blockH) / 2;
          return (
            <rect
              key={stage.status}
              x={x}
              y={y}
              width={blockW}
              height={blockH}
              rx={10}
              fill={stageColor(stage.status)}
              opacity={0.18}
              stroke={stageColor(stage.status)}
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div className="grid grid-cols-3 gap-4">
        {ordered.map((stage) => (
          <Link
            key={stage.status}
            href={`/practices?onboardingStatus=${encodeURIComponent(stage.status)}`}
            className="relative block rounded-xl border border-border/70 bg-surface px-5 py-4 hover:bg-surface-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">
                {STAGE_LABELS[stage.status] ?? stage.status}
              </span>
              {stage.stuckCount > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-50 text-red-700 border border-red-200">
                  {stage.stuckCount} stuck
                </span>
              ) : null}
            </div>
            <div className="font-display text-3xl text-text tracking-tight tabular-nums mt-2 leading-none">
              {formatCount(stage.count)}
            </div>
            <div className="mt-2 text-[11px] text-text-subtle">
              Median {formatHumanDurationHours(stage.medianHoursInStage)} in stage
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
