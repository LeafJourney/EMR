import { Card, CardContent } from "@/components/ui/card";
import {
  DistributionBar,
  ProgressDonut,
  TrendLine,
} from "@/components/charts";

/**
 * Analytics Lab — at-a-glance snapshot card row.
 *
 * Demonstrates the branded chart wrappers in the operator surface: a 14-day
 * outcome-improvement trend, a metric-coverage donut, and a per-cohort bar
 * distribution. All values are illustrative; the real connectors land in the
 * downstream Lab pages.
 */

const TREND: { label: string; improvement: number }[] = [
  { label: "D-13", improvement: 41 },
  { label: "D-12", improvement: 43 },
  { label: "D-11", improvement: 44 },
  { label: "D-10", improvement: 45 },
  { label: "D-9", improvement: 46 },
  { label: "D-8", improvement: 47 },
  { label: "D-7", improvement: 47 },
  { label: "D-6", improvement: 48 },
  { label: "D-5", improvement: 49 },
  { label: "D-4", improvement: 51 },
  { label: "D-3", improvement: 52 },
  { label: "D-2", improvement: 53 },
  { label: "D-1", improvement: 54 },
  { label: "Today", improvement: 55 },
];

const COHORTS: { label: string; value: number }[] = [
  { label: "Pain", value: 184 },
  { label: "Sleep", value: 162 },
  { label: "Anxiety", value: 148 },
  { label: "Mood", value: 121 },
  { label: "Nausea", value: 76 },
];

export function LabSnapshot() {
  return (
    <section className="mb-8 grid gap-4 md:grid-cols-[1.4fr,0.7fr,1.1fr]">
      <Card tone="raised">
        <CardContent className="py-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
            14-day cohort outcome improvement
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            % of patients trending better, smoothed across all metrics.
          </p>
          <div className="mt-3">
            <TrendLine
              data={TREND}
              xKey="label"
              height={160}
              unit="%"
              lines={[{ dataKey: "improvement", label: "Improving" }]}
            />
          </div>
        </CardContent>
      </Card>
      <Card tone="raised">
        <CardContent className="py-5 flex flex-col items-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle self-start">
            Metric coverage
          </p>
          <p className="text-xs text-text-muted mt-0.5 self-start">
            Patients with at least one outcome log this week.
          </p>
          <div className="mt-3">
            <ProgressDonut
              value={612}
              max={891}
              size={140}
              sublabel="612 of 891"
            />
          </div>
        </CardContent>
      </Card>
      <Card tone="raised">
        <CardContent className="py-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
            Active cohorts
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            Logged outcomes per metric in the last 30 days.
          </p>
          <div className="mt-3">
            <DistributionBar data={COHORTS} height={160} rainbow />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
