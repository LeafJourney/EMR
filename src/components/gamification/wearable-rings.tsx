import React from "react";
import { Footprints, Moon, Sparkles } from "lucide-react";
import type { WearableSummary } from "@/lib/domain/achievements";

// EMR-161 — Wearable rings for the lifestyle view.
//
// Apple-Watch-style concentric progress rings driven by the patient's
// wearable summary (steps / sleep / mindful minutes), styled to sit inside
// the light lifestyle card rather than the standalone black gamification
// card. Pure SVG, server-renderable — no client hooks.

interface RingSpec {
  key: string;
  label: string;
  /** 0..1 progress toward the daily goal. */
  pct: number;
  /** Display value, e.g. "7,842" or "7.1h". */
  display: string;
  goalLabel: string;
  color: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const STEP_GOAL = 10_000;
const SLEEP_GOAL_HOURS = 8;
const MINDFUL_GOAL_MIN = 20;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function WearableRings({ summary }: { summary: WearableSummary }) {
  const rings: RingSpec[] = [
    {
      key: "steps",
      label: "Steps",
      pct: clamp01(summary.steps / STEP_GOAL),
      display: summary.steps.toLocaleString(),
      goalLabel: `${STEP_GOAL.toLocaleString()} goal`,
      color: "var(--accent)",
      Icon: Footprints,
    },
    {
      key: "sleep",
      label: "Sleep",
      pct: clamp01(summary.sleepHours / SLEEP_GOAL_HOURS),
      display: `${summary.sleepHours}h`,
      goalLabel: `${SLEEP_GOAL_HOURS}h goal`,
      color: "var(--info)",
      Icon: Moon,
    },
    {
      key: "mindful",
      label: "Mindful",
      pct: clamp01(summary.mindfulMinutes / MINDFUL_GOAL_MIN),
      display: `${summary.mindfulMinutes}m`,
      goalLabel: `${MINDFUL_GOAL_MIN}m goal`,
      color: "var(--highlight)",
      Icon: Sparkles,
    },
  ];

  const size = 132;
  const center = size / 2;
  const strokeWidth = 11;
  const gap = 4;
  const radii = [
    center - strokeWidth / 2 - 2,
    center - strokeWidth / 2 - 2 - (strokeWidth + gap),
    center - strokeWidth / 2 - 2 - 2 * (strokeWidth + gap),
  ];

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90"
          role="img"
          aria-label="Wearable activity rings"
        >
          {rings.map((ring, i) => {
            const r = radii[i];
            const circ = 2 * Math.PI * r;
            return (
              <g key={ring.key}>
                <circle
                  cx={center}
                  cy={center}
                  r={r}
                  stroke={ring.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  className="opacity-15"
                />
                <circle
                  cx={center}
                  cy={center}
                  r={r}
                  stroke={ring.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ - ring.pct * circ}
                  className="transition-[stroke-dashoffset] duration-1000 ease-out"
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-lg text-text tabular-nums leading-none">
            {summary.restingHeartRate}
          </span>
          <span className="text-[9px] uppercase tracking-[0.12em] text-text-subtle mt-0.5">
            bpm rest
          </span>
        </div>
      </div>

      <ul className="space-y-2 min-w-0">
        {rings.map((ring) => (
          <li key={ring.key} className="flex items-center gap-2.5">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: ring.color, color: "#fff" }}
            >
              <ring.Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm text-text leading-tight">
                <span className="font-medium tabular-nums">{ring.display}</span>{" "}
                <span className="text-text-subtle">{ring.label}</span>
              </p>
              <p className="text-[10px] uppercase tracking-[0.1em] text-text-subtle">
                {ring.goalLabel}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
