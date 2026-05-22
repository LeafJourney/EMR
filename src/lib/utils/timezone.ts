/**
 * Timezone-aware date calculations for daily resets and clinical metrics.
 * Uses standard Intl.DateTimeFormat to avoid external library dependencies.
 */

export function getLocalDayBounds(timeZone: string, date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const parts = formatter.formatToParts(date);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const day = parseInt(parts.find((p) => p.type === "day")!.value, 10);
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);

  // Construct start of day in UTC components
  const approxDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  // Determine timezone offset in ms at target day's midnight
  const formatterWithHour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const getOffset = (d: Date) => {
    const locParts = formatterWithHour.formatToParts(d);
    const locYear = parseInt(locParts.find((p) => p.type === "year")!.value, 10);
    const locMonth = parseInt(locParts.find((p) => p.type === "month")!.value, 10);
    const locDay = parseInt(locParts.find((p) => p.type === "day")!.value, 10);
    const locHour = parseInt(locParts.find((p) => p.type === "hour")!.value, 10);
    const locMin = parseInt(locParts.find((p) => p.type === "minute")!.value, 10);
    const locSec = parseInt(locParts.find((p) => p.type === "second")!.value, 10);

    const locUtc = Date.UTC(locYear, locMonth - 1, locDay, locHour, locMin, locSec);
    return locUtc - d.getTime();
  };

  const offset = getOffset(approxDate);
  const startOfDay = new Date(approxDate.getTime() - offset);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  return { startOfDay, endOfDay };
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
