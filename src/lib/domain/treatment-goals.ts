// Treatment Goals — visual progress toward what patients want

export type GoalMetric = "pain" | "sleep" | "anxiety" | "mood" | "energy" | "nausea" | "appetite";
export type GoalDirection = "decrease" | "increase";

export interface TreatmentGoal {
  id: string;
  patientId: string;
  metric: GoalMetric;
  direction: GoalDirection;
  baseline: number; // 1-10 scale
  target: number; // 1-10 scale
  currentValue?: number;
  startedAt: string;
  targetDate?: string;
  status: "active" | "achieved" | "paused" | "abandoned";
}

export interface GoalProgress {
  goal: TreatmentGoal;
  percentComplete: number; // 0-100
  trend: "improving" | "steady" | "worsening";
  daysActive: number;
  isOnTrack: boolean;
}

export const GOAL_METRIC_LABELS: Record<GoalMetric, { label: string; emoji: string; unit: string }> = {
  pain: { label: "Less pain", emoji: "🌤️", unit: "pain level" },
  sleep: { label: "Better sleep", emoji: "😴", unit: "sleep quality" },
  anxiety: { label: "Less anxiety", emoji: "🧘", unit: "anxiety level" },
  mood: { label: "Better mood", emoji: "😊", unit: "mood score" },
  energy: { label: "More energy", emoji: "⚡", unit: "energy level" },
  nausea: { label: "Less nausea", emoji: "🌊", unit: "nausea level" },
  appetite: { label: "Better appetite", emoji: "🍽️", unit: "appetite" },
};

/**
 * Calculate progress toward a goal.
 */
export function calculateGoalProgress(goal: TreatmentGoal, currentValue: number): GoalProgress {
  // Signed, so moving the WRONG way from baseline counts as 0% — not progress.
  // (e.g. a "less pain" goal of 7→3 with a current of 9 is 0%, not |9-7|/|3-7|=50%.)
  const range = goal.target - goal.baseline;
  const moved = currentValue - goal.baseline;
  const percentComplete =
    range === 0 ? 100 : Math.min(100, Math.max(0, Math.round((moved / range) * 100)));

  let trend: GoalProgress["trend"] = "steady";
  if (goal.direction === "decrease") {
    trend = currentValue < goal.baseline ? "improving" : currentValue > goal.baseline ? "worsening" : "steady";
  } else {
    trend = currentValue > goal.baseline ? "improving" : currentValue < goal.baseline ? "worsening" : "steady";
  }

  const daysActive = Math.round((Date.now() - new Date(goal.startedAt).getTime()) / 86400000);

  // "On track" = making progress proportional to time elapsed (rough heuristic)
  const expectedProgress = goal.targetDate
    ? Math.min(100, (daysActive / Math.max(1, Math.round((new Date(goal.targetDate).getTime() - new Date(goal.startedAt).getTime()) / 86400000))) * 100)
    : 0;
  const isOnTrack = percentComplete >= expectedProgress - 10; // 10% grace

  return {
    goal,
    percentComplete,
    trend,
    daysActive,
    isOnTrack,
  };
}
