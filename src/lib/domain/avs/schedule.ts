// ───────────────────────────────────────────────────────────────────────────
// EMR-1152 — Titration calendars + lifestyle roadmaps (pure render model)
// ───────────────────────────────────────────────────────────────────────────
// Doc Phases 4–6: render the decomposed care plan as scannable visual
// schedules — a medication titration calendar (day-range × time-of-day × plain
// instruction × goal) per the metformin example, plus nutrition + behavior
// roadmaps in encouraging plain language. "No long paragraphs" — everything is
// a time-ordered component. This module produces the data model; the RSC
// renders it.

import type {
  BehavioralItem,
  DecomposedCarePlan,
  DietaryProtocol,
  LifestyleRoadmap,
  MedicationAction,
  RoadmapItem,
  TitrationCalendar,
  TitrationStep,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Time-of-day + duration helpers                                              */
/* -------------------------------------------------------------------------- */

export function timeOfDayFromTiming(timing: string | null): string {
  switch (timing) {
    case "twice daily":
      return "Morning and evening";
    case "three times daily":
      return "Morning, midday, and evening";
    case "four times daily":
      return "Spread through the day";
    case "at bedtime":
      return "At bedtime";
    case "every morning":
      return "Morning";
    case "with meals":
      return "With meals";
    case "once daily":
      return "Once a day";
    case "as needed":
      return "Only when you need it";
    case "every other day":
      return "Every other day";
    case "weekly":
      return "Once a week";
    default:
      return "As your care team directed";
  }
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, twelve: 12,
};

/**
 * Parse a "start later" delay from titration prose into days:
 * "after two weeks" → 14, "in 10 days" → 10, "after 1 month" → 30.
 */
export function parseDelayDays(text: string): number | null {
  const m = text
    .toLowerCase()
    .match(/\b(?:after|in)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(day|days|week|weeks|month|months)\b/);
  if (!m) return null;
  const n = WORD_NUMBERS[m[1]] ?? Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2];
  if (unit.startsWith("day")) return n;
  if (unit.startsWith("week")) return n * 7;
  return n * 30;
}

function dayRangeLabel(startDay: number, endDay: number | null): string {
  if (endDay == null) return `Day ${startDay} onward`;
  if (startDay === endDay) return `Day ${startDay}`;
  return `Days ${startDay}–${endDay}`;
}

function instructionFor(med: MedicationAction): string {
  const dose = med.dose ?? "your dose";
  const route = med.route ? ` ${med.route}` : "";
  return `Take ${dose}${route}`;
}

const DOSING_ACTIONS = new Set(["INITIATE", "TITRATE", "MAINTAIN"]);

/* -------------------------------------------------------------------------- */
/* Titration calendars                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Group dosing medication actions by molecule into a step-by-step calendar.
 * An INITIATE followed by a TITRATE "after two weeks" becomes two steps:
 * Days 1–14 at the starting dose, then Day 15 onward at the titrated dose.
 * DISCONTINUE actions are excluded (they're "stop" instructions, not a schedule).
 */
export function buildTitrationCalendars(decomposed: DecomposedCarePlan): TitrationCalendar[] {
  const byMolecule = new Map<string, MedicationAction[]>();
  for (const med of decomposed.medications) {
    if (!DOSING_ACTIONS.has(med.action)) continue;
    const key = med.molecule.toLowerCase();
    const list = byMolecule.get(key) ?? [];
    list.push(med);
    byMolecule.set(key, list);
  }

  const calendars: TitrationCalendar[] = [];
  for (const meds of byMolecule.values()) {
    // Stable order: the starting dose (INITIATE/MAINTAIN) before titrations.
    const ordered = [...meds].sort((a, b) => actionRank(a.action) - actionRank(b.action));
    const steps: TitrationStep[] = [];
    let cursor = 1;

    ordered.forEach((med, idx) => {
      const isLast = idx === ordered.length - 1;
      const nextMed = ordered[idx + 1];
      const delay = nextMed ? parseDelayDays(nextMed.raw) : null;
      const endDay = !isLast && delay ? delay : null;

      steps.push({
        startDay: cursor,
        endDay,
        dayRange: dayRangeLabel(cursor, endDay),
        timeOfDay: timeOfDayFromTiming(med.timing),
        instruction: instructionFor(med),
        goal:
          med.action === "TITRATE" && med.dose
            ? `Reach your target of ${med.dose}`
            : null,
      });

      if (endDay) cursor = endDay + 1;
    });

    calendars.push({ molecule: meds[0].molecule, steps });
  }

  return calendars;
}

function actionRank(action: MedicationAction["action"]): number {
  switch (action) {
    case "INITIATE":
      return 0;
    case "MAINTAIN":
      return 1;
    case "TITRATE":
      return 2;
    default:
      return 3;
  }
}

/* -------------------------------------------------------------------------- */
/* Lifestyle roadmap                                                           */
/* -------------------------------------------------------------------------- */

const DIETARY_ICON: Record<DietaryProtocol["kind"], string> = {
  time_restricted_eating: "🕒",
  fasting: "🌙",
  macronutrient: "🥗",
  hydration: "💧",
  other: "🍽️",
};

const DIETARY_LABEL: Record<DietaryProtocol["kind"], string> = {
  time_restricted_eating: "Eating window",
  fasting: "Fasting plan",
  macronutrient: "Food choices",
  hydration: "Hydration",
  other: "Nutrition",
};

const BEHAVIOR_ICON: Record<BehavioralItem["kind"], string> = {
  sleep: "😴",
  activity: "🚶",
  mindfulness: "🧘",
  monitoring: "📊",
  substance: "🚭",
  other: "✅",
};

const BEHAVIOR_LABEL: Record<BehavioralItem["kind"], string> = {
  sleep: "Sleep",
  activity: "Move your body",
  mindfulness: "Calm your mind",
  monitoring: "Track your numbers",
  substance: "Cut back",
  other: "Healthy habit",
};

function dietaryRoadmapItem(d: DietaryProtocol): RoadmapItem {
  const label = d.window ? `${DIETARY_LABEL[d.kind]} (${d.window})` : DIETARY_LABEL[d.kind];
  return { icon: DIETARY_ICON[d.kind], label, detail: d.detail };
}

function behaviorRoadmapItem(b: BehavioralItem): RoadmapItem {
  const label = b.target ? `${BEHAVIOR_LABEL[b.kind]} — ${b.target}` : BEHAVIOR_LABEL[b.kind];
  return { icon: BEHAVIOR_ICON[b.kind], label, detail: b.detail };
}

export function buildLifestyleRoadmap(decomposed: DecomposedCarePlan): LifestyleRoadmap {
  return {
    nutrition: decomposed.dietary.map(dietaryRoadmapItem),
    behavior: decomposed.behavioral.map(behaviorRoadmapItem),
  };
}
