"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker, toISODate } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils/cn";

// Goal target dates should be in the future. Capture once per render.
const GOALS_TODAY = toISODate(new Date());
import {
  GOAL_METRIC_LABELS,
  calculateGoalProgress,
  type GoalMetric,
  type TreatmentGoal,
} from "@/lib/domain/treatment-goals";

export interface GoalSeed {
  goal: TreatmentGoal;
  currentValue: number;
}

interface Props {
  seeds: GoalSeed[];
  latestByMetric: Record<string, number>;
}

const METRIC_KEYS = Object.keys(GOAL_METRIC_LABELS) as GoalMetric[];

export function GoalsView({ seeds, latestByMetric }: Props) {
  const [items, setItems] = useState<GoalSeed[]>(seeds);
  const [showForm, setShowForm] = useState(false);

  const active = items.filter((it) => it.goal.status === "active");
  const achieved = items.filter((it) => it.goal.status === "achieved");

  function addGoal(seed: GoalSeed) {
    setItems((prev) => [seed, ...prev]);
    setShowForm(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="rounded-xl">
            + Set a new goal
          </Button>
        )}
      </div>

      {showForm && (
        <NewGoalForm
          onCancel={() => setShowForm(false)}
          onCreate={addGoal}
          latestByMetric={latestByMetric}
        />
      )}

      {active.length === 0 && !showForm && (
        <Card className="rounded-2xl text-center">
          <CardContent className="py-10">
            <p className="text-5xl mb-3">🎯</p>
            <p className="font-display text-lg text-text">No active goals yet</p>
            <p className="text-sm text-text-muted mt-2 max-w-sm mx-auto">
              Pick something you'd like to improve — pain, sleep, mood — and
              we'll track your progress.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {active.map((it) => (
          <GoalCard key={it.goal.id} seed={it} />
        ))}
      </div>

      {achieved.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mt-6">
            <span className="text-2xl">✨</span>
            <h2 className="font-display text-xl text-text tracking-tight">
              Achieved
            </h2>
          </div>
          {achieved.map((it) => (
            <GoalCard key={it.goal.id} seed={it} achieved />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalCard({ seed, achieved }: { seed: GoalSeed; achieved?: boolean }) {
  const progress = calculateGoalProgress(seed.goal, seed.currentValue);
  const meta = GOAL_METRIC_LABELS[seed.goal.metric];

  const trendBarColor =
    progress.trend === "improving"
      ? "from-accent/70 to-accent"
      : progress.trend === "worsening"
      ? "from-orange-300 to-orange-500"
      : "from-gray-300 to-gray-400";

  return (
    <Card className={cn("rounded-2xl", achieved && "bg-accent-soft/50")}>
      <CardContent className="py-6 px-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{meta.emoji}</span>
            <div>
              <p className="font-display text-lg text-text tracking-tight">
                {meta.label}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {progress.daysActive} day{progress.daysActive === 1 ? "" : "s"} active
              </p>
            </div>
          </div>
          {achieved ? (
            <Badge tone="success">Achieved ✨</Badge>
          ) : progress.isOnTrack ? (
            <Badge tone="success">On track</Badge>
          ) : (
            <Badge tone="warning">Needs attention</Badge>
          )}
        </div>

        <div className="mb-3">
          <div className="h-3 w-full rounded-full bg-surface-muted overflow-hidden border border-border/60">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r transition-all duration-700 ease-out",
                trendBarColor
              )}
              style={{ width: `${Math.max(2, progress.percentComplete)}%` }}
            />
          </div>
          <p className="text-right text-[11px] text-text-muted mt-1.5 tabular-nums">
            {progress.percentComplete}% of the way there
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <Pill label="Baseline" value={seed.goal.baseline} muted />
          <Pill label="Current" value={seed.currentValue} highlight />
          <Pill label="Target" value={seed.goal.target} muted />
        </div>

        {seed.goal.targetDate && (
          <p className="text-[11px] text-text-subtle text-center mt-3">
            Target by {new Date(seed.goal.targetDate).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Pill({
  label,
  value,
  muted,
  highlight,
}: {
  label: string;
  value: number;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl py-2.5 px-3 border",
        highlight
          ? "bg-accent-soft border-accent/30 text-accent"
          : muted
          ? "bg-surface-muted border-border/60 text-text-muted"
          : "bg-surface border-border text-text"
      )}
    >
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
        {label}
      </p>
      <p className="text-xl font-display tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

function NewGoalForm({
  onCancel,
  onCreate,
  latestByMetric,
}: {
  onCancel: () => void;
  onCreate: (seed: GoalSeed) => void;
  latestByMetric: Record<string, number>;
}) {
  const [metric, setMetric] = useState<GoalMetric>("pain");
  const [baseline, setBaseline] = useState(7);
  const [target, setTarget] = useState(3);
  const [targetDate, setTargetDate] = useState("");

  const meta = GOAL_METRIC_LABELS[metric];
  const direction: "decrease" | "increase" = useMemo(
    () => (target < baseline ? "decrease" : "increase"),
    [baseline, target]
  );

  function submit() {
    const seed: GoalSeed = {
      goal: {
        id: `goal-${Date.now()}`,
        patientId: "self",
        metric,
        direction,
        baseline,
        target,
        startedAt: new Date().toISOString(),
        targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
        status: "active",
      },
      currentValue: latestByMetric[metric] ?? baseline,
    };
    onCreate(seed);
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="py-7 px-7">
        <p className="font-display text-xl text-text tracking-tight mb-5">
          New goal
        </p>

        {/* Metric picker */}
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-wider text-text-subtle font-semibold mb-2">
            What do you want to improve?
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {METRIC_KEYS.map((m) => {
              const mMeta = GOAL_METRIC_LABELS[m];
              const isActive = m === metric;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-2xl border-2 transition-all active:scale-95",
                    isActive
                      ? "border-accent bg-accent-soft"
                      : "border-transparent bg-surface-muted hover:border-border"
                  )}
                >
                  <span className="text-2xl">{mMeta.emoji}</span>
                  <span className="text-[11px] font-medium text-text leading-tight text-center">
                    {mMeta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Baseline */}
        <ScaleSlider
          label={`Today's ${meta.unit}`}
          value={baseline}
          onChange={setBaseline}
        />

        {/* Target */}
        <ScaleSlider
          label={`Target ${meta.unit}`}
          value={target}
          onChange={setTarget}
        />

        {/* Target date */}
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-wider text-text-subtle font-semibold mb-2">
            Target date (optional)
          </p>
          <DatePicker
            value={targetDate}
            onChange={setTargetDate}
            min={GOALS_TODAY}
            placeholder="Pick a target date"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onCancel} className="rounded-xl">
            Cancel
          </Button>
          <Button onClick={submit} className="rounded-xl px-6">
            Save goal
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ScaleSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-wider text-text-subtle font-semibold">
          {label}
        </p>
        <span className="text-lg font-display text-accent tabular-nums">
          {value}
        </span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "flex-1 h-10 rounded-lg text-sm font-medium transition-all active:scale-90",
              value === n
                ? "bg-accent text-white shadow-sm"
                : n <= value
                ? "bg-accent/20 text-accent"
                : "bg-surface-muted text-text-muted hover:bg-border"
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
