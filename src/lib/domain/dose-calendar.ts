// Dose Calendar — visual dose tracking for patients
// Calendar-based view of medication adherence using DoseLog model.

export interface DoseCalendarEntry {
  date: string; // ISO date
  regimen: string; // product name
  scheduledDoses: number;
  takenDoses: number;
  adherencePercent: number;
  doses: {
    time: string;
    taken: boolean;
    amount?: number;
    unit?: string;
    notes?: string;
  }[];
}

export type AdherenceLevel = "perfect" | "good" | "partial" | "missed";

export function getAdherenceLevel(percent: number): AdherenceLevel {
  if (percent >= 100) return "perfect";
  if (percent >= 75) return "good";
  if (percent > 0) return "partial";
  return "missed";
}

export const ADHERENCE_COLORS: Record<AdherenceLevel, { bg: string; text: string; ring: string }> = {
  perfect: { bg: "bg-emerald-500", text: "text-white", ring: "ring-emerald-300" },
  good: { bg: "bg-emerald-200", text: "text-emerald-800", ring: "ring-emerald-200" },
  partial: { bg: "bg-amber-200", text: "text-amber-800", ring: "ring-amber-200" },
  missed: { bg: "bg-red-100", text: "text-red-700", ring: "ring-red-200" },
};

/** A patient's real dose-log row, trimmed to what the calendar needs. */
export interface DoseLogLite {
  loggedAt: string; // ISO
  actualVolume: number;
  volumeUnit: string;
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Build a month of REAL calendar entries from the patient's dose logs.
 *
 * `scheduledPerDay` is the active regimen's frequency (0 when there's no active
 * regimen). With a schedule, adherence = logged ÷ scheduled and past days with
 * no logs show as "missed". Without a schedule we can't define adherence, so we
 * only surface the days the patient actually logged (no fabricated baseline).
 */
export function buildMonthEntries(
  logs: DoseLogLite[],
  scheduledPerDay: number,
  regimenName: string,
  year: number,
  month: number,
): DoseCalendarEntry[] {
  const byDay = new Map<string, DoseLogLite[]>();
  for (const log of logs) {
    const key = localDayKey(new Date(log.loggedAt));
    const bucket = byDay.get(key);
    if (bucket) bucket.push(log);
    else byDay.set(key, [log]);
  }

  const today = new Date();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries: DoseCalendarEntry[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    if (date > today) break;

    const key = localDayKey(date);
    const dayLogs = byDay.get(key) ?? [];
    // No schedule and nothing logged → leave the day blank rather than invent one.
    if (scheduledPerDay === 0 && dayLogs.length === 0) continue;

    const takenDoses = dayLogs.length;
    const scheduledDoses = scheduledPerDay > 0 ? scheduledPerDay : takenDoses;

    entries.push({
      date: key,
      regimen: regimenName,
      scheduledDoses,
      takenDoses,
      adherencePercent:
        scheduledDoses > 0
          ? Math.min(100, Math.round((takenDoses / scheduledDoses) * 100))
          : 0,
      doses: dayLogs
        .slice()
        .sort((a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime())
        .map((log) => ({
          time: new Date(log.loggedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          taken: true,
          amount: log.actualVolume,
          unit: log.volumeUnit,
        })),
    });
  }

  return entries;
}
