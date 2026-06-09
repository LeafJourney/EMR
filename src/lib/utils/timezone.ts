/**
 * Timezone-aware date calculations for daily resets and clinical metrics.
 * Uses standard Intl.DateTimeFormat to avoid external library dependencies.
 */

/**
 * App-wide default clinic timezone, used when an Organization/Practice has not
 * configured one. Centralized here so server surfaces stop hard-coding the
 * literal "America/Los_Angeles" string in a dozen places.
 */
export const DEFAULT_TIME_ZONE = "America/Los_Angeles";

/**
 * Offset (ms) of an IANA timezone at a given instant: the difference between
 * the zone's wall-clock reading of `date` and the UTC instant. Positive for
 * zones east of UTC, negative for the Americas. Single source of truth for the
 * day-bounds and wall-clock→UTC conversions below.
 */
function tzOffsetMs(timeZone: string, date: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  // Intl with hour12:false can emit "24" for midnight in some engines.
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const locUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  return locUtc - date.getTime();
}

export function getLocalDayBounds(timeZone: string, date: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);

  // Construct the target day's midnight as if it were UTC, then correct by the
  // zone's offset at that moment.
  const approxDate = new Date(Date.UTC(get("year"), get("month") - 1, get("day"), 0, 0, 0));
  const offset = tzOffsetMs(timeZone, approxDate);
  const startOfDay = new Date(approxDate.getTime() - offset);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  return { startOfDay, endOfDay };
}

/**
 * Wall-clock parts (year/month/day/hour/minute + 0–6 weekday, Sun=0) for an
 * instant as read in a given timezone. Use for greetings, day-of-week labels,
 * and any "what time is it at the clinic" logic that must not drift to the
 * server's UTC clock.
 */
export function getZonedParts(timeZone: string, date: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  let hour = get("hour");
  if (hour === 24) hour = 0;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // Weekday of a calendar date is timezone-independent once Y/M/D is fixed.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute: get("minute"), weekday };
}

/**
 * Time-of-day greeting computed in the clinic's timezone rather than the
 * server's UTC clock — the fix for "Still up, Dr. Lena" firing mid-afternoon
 * (server-side `new Date().getHours()` returned the UTC hour).
 */
export function greetingForTimeZone(timeZone: string, date: Date = new Date()): string {
  const { hour } = getZonedParts(timeZone, date);
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Hello";
}

/**
 * Convert a wall-clock time in a given timezone to the correct UTC instant.
 * Inverse of reading a Date in a timezone. Use when persisting a user-picked
 * local time (e.g. a booking slot "11:00" at the clinic) so it is stored as
 * the right absolute instant instead of being misread as 11:00 UTC.
 *
 * Accurate except within the 1-hour DST gap/overlap (same caveat as the
 * day-bounds math above), which is acceptable for appointment scheduling.
 */
export function zonedTimeToUtc(
  timeZone: string,
  parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
  },
): Date {
  const { year, month, day, hour = 0, minute = 0, second = 0 } = parts;
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = tzOffsetMs(timeZone, new Date(asUtc));
  return new Date(asUtc - offset);
}

/**
 * Formats a Date in a specific timezone to check if two Dates represent the same local day.
 */
export function sameLocalDay(a: Date, b: Date, timeZone: string): boolean {
  const format = (d: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(d);
  return format(a) === format(b);
}
