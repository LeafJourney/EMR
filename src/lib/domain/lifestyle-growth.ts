/**
 * Lifestyle → Plant Growth — EMR-072
 *
 * Translates a stream of lifestyle-toolkit check events into plant-growth
 * mechanics:
 *
 *   • Every check                                   → +1 leaf
 *   • One check in every category on the same day   → +1 stem
 *   • Every-category coverage for 30 straight days  → flowers bloom
 *
 * Pure module — no DB, no React. The lifestyle toolkit page persists a
 * compact event log in localStorage and hands it to {@link computeLifestyleGrowth}
 * to render the growth preview.
 *
 * Caps mirror the existing plant-health visual: 12 leaves, 5 stems, 1 flower
 * state. We do not write the result to the database; the patient's plant on
 * the home dashboard still derives from {@link computePlantHealth}. This
 * module powers the on-page preview that makes the engagement loop tangible.
 */
export interface LifestyleCheckEvent {
  /** A stable id like `<domainId>::<tipTitle>`. */
  tipKey: string;
  /** The category the tip belongs to (sleep, nutrition, etc.). */
  domainId: string;
  /** When the check was recorded — ISO timestamp. */
  checkedAt: string;
}

export interface LifestyleGrowth {
  /** Total leaves earned, capped at {@link LEAF_CAP}. */
  leafCount: number;
  /** Stems unlocked (one per day with full category coverage), capped at {@link STEM_CAP}. */
  stemCount: number;
  /** Days in current streak of all-category coverage (resets on any gap). */
  streakDays: number;
  /** True once the streak hits {@link FLOWER_STREAK_DAYS}. */
  hasFlowers: boolean;
  /** Categories the patient touched today — for "what's missing" hints. */
  todaysCategories: string[];
  /** Categories still missing today to earn a stem. */
  missingToday: string[];
  /** Plain-language nudge for the next action. */
  nextNudge: string;
}

export const LEAF_CAP = 12;
export const STEM_CAP = 5;
export const FLOWER_STREAK_DAYS = 30;

/** YYYY-MM-DD for a given Date (local time — patients live in their tz). */
export function dayKey(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
}

/** Build a map of dayKey → Set<domainId> from a stream of events. */
function bucketByDay(events: LifestyleCheckEvent[]): Map<string, Set<string>> {
  const buckets = new Map<string, Set<string>>();
  for (const e of events) {
    const d = new Date(e.checkedAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    let set = buckets.get(key);
    if (!set) {
      set = new Set();
      buckets.set(key, set);
    }
    set.add(e.domainId);
  }
  return buckets;
}

/** Count consecutive days ending today where every category appears. */
function streakLength(
  buckets: Map<string, Set<string>>,
  categories: string[],
  today: Date,
): number {
  let streak = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Walk back day by day; stop when a day fails coverage.
  for (let i = 0; i < FLOWER_STREAK_DAYS * 2; i++) {
    const key = dayKey(cursor);
    const set = buckets.get(key);
    const covered = set && categories.every((c) => set.has(c));
    if (!covered) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface LifestyleGrowthInput {
  events: LifestyleCheckEvent[];
  /** All category ids the patient must touch in a day to earn a stem. */
  categories: string[];
  /** Defaults to `new Date()`; injectable for tests. */
  now?: Date;
}

export function computeLifestyleGrowth(
  input: LifestyleGrowthInput,
): LifestyleGrowth {
  const now = input.now ?? new Date();
  const buckets = bucketByDay(input.events);

  // Leaves: total checks, capped.
  const leafCount = Math.min(LEAF_CAP, input.events.length);

  // Stems: days with full-category coverage, capped.
  const fullDays = Array.from(buckets.values()).filter((set) =>
    input.categories.every((c) => set.has(c)),
  ).length;
  const stemCount = Math.min(STEM_CAP, fullDays);

  // Streak ending today (or the previous day if today has no activity yet).
  const todayKey = dayKey(now);
  const todaysSet = buckets.get(todayKey) ?? new Set<string>();
  const todaysCategories = Array.from(todaysSet);
  const missingToday = input.categories.filter((c) => !todaysSet.has(c));

  const streakDays = streakLength(buckets, input.categories, now);
  const hasFlowers = streakDays >= FLOWER_STREAK_DAYS;

  const nextNudge = buildNudge({
    missingToday,
    hasFlowers,
    streakDays,
    leafCount,
  });

  return {
    leafCount,
    stemCount,
    streakDays,
    hasFlowers,
    todaysCategories,
    missingToday,
    nextNudge,
  };
}

function buildNudge(params: {
  missingToday: string[];
  hasFlowers: boolean;
  streakDays: number;
  leafCount: number;
}): string {
  if (params.hasFlowers) {
    return "Your plant is in full bloom — every consistent day keeps it there.";
  }
  if (params.missingToday.length === 0) {
    if (params.streakDays >= 1) {
      const remaining = FLOWER_STREAK_DAYS - params.streakDays;
      return `Stem earned today. ${remaining} more days of full coverage and flowers bloom.`;
    }
    return "Stem earned today — keep tomorrow's coverage going.";
  }
  if (params.leafCount === 0) {
    return "Tap any tip to grow your first leaf.";
  }
  const sample = params.missingToday[0];
  return `One ${sample} check today rounds out your stem.`;
}
