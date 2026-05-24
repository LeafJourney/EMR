"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";
import {
  HeatmapWeek,
  ProgressDonut,
  TrendArea,
  type HeatmapWeekDatum,
} from "@/components/charts";

export interface LifestyleTrendPoint {
  /** Week / day label rendered on the x-axis. */
  label: string;
  /** Smoothed average outcome score (0–10). */
  outcome: number;
}

export interface LifestyleTrendsProps {
  /** Time-series outcome scores for the area chart. */
  trend: LifestyleTrendPoint[];
  /** Daily activity for the heatmap (last ~16 weeks). */
  activity: HeatmapWeekDatum[];
  /** Number of unlocked achievements. */
  unlockedCount: number;
  /** Total achievements available. */
  totalAchievements: number;
}

/**
 * Lifestyle Trends — a 3-up trends band for the `/portal/lifestyle` page.
 *
 * - `<TrendArea>` for the rolling outcome score (delight + clarity).
 * - `<HeatmapWeek>` for daily check-in cadence (encourages streaks).
 * - `<ProgressDonut>` for achievement completion (immediate "wins" read).
 *
 * The panel renders nothing when there's no data to display so it never
 * pushes an empty band onto a brand-new patient's first visit.
 */
export function LifestyleTrends({
  trend,
  activity,
  unlockedCount,
  totalAchievements,
}: LifestyleTrendsProps) {
  if (trend.length === 0 && activity.length === 0 && totalAchievements === 0) {
    return null;
  }
  return (
    <section className="mb-10">
      <Eyebrow className="mb-3">Your trends</Eyebrow>
      <div className="grid gap-4 md:grid-cols-[1.4fr,1fr,0.7fr]">
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
              Rolling outcome score
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              How you&rsquo;ve been feeling, smoothed week over week.
            </p>
            <div className="mt-3">
              <TrendArea
                data={trend}
                xKey="label"
                height={180}
                lines={[{ dataKey: "outcome", label: "Outcome" }]}
                emptyTitle="No check-ins yet"
                emptyDescription="Log a feeling and your trend will appear here."
              />
            </div>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
              Check-in cadence
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              The last 16 weeks of log activity.
            </p>
            <div className="mt-4">
              <HeatmapWeek
                values={activity}
                weeks={16}
                emptyTitle="No activity yet"
                emptyDescription="Your daily check-ins will fill in here."
              />
            </div>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="py-5 flex flex-col items-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle self-start">
              Achievements
            </p>
            <div className="mt-2">
              <ProgressDonut
                value={unlockedCount}
                max={Math.max(totalAchievements, 1)}
                size={140}
                sublabel={`${unlockedCount}/${totalAchievements}`}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
