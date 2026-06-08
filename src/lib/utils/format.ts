// Small formatting helpers. Intentionally minimal — no date library in V1.

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Formats a calendar-date-only value (e.g. a date of birth) WITHOUT shifting
 * it across timezones. DOB and similar fields are stored at UTC midnight, so
 * rendering them with the runtime's local timezone rolls the day back one in
 * negative-offset zones (the off-by-one DOB bug). Always read date-only fields
 * in UTC so every surface — server or client — agrees on the stored date.
 *
 * Use for birth dates and other true calendar dates. NEVER use for timestamps
 * (createdAt, appointment times) — those are real instants and want a real
 * timezone; use `formatDate` for those.
 */
export function formatDateOnly(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Formats a timestamp's DATE in a specific timezone. Use for real instants
 * (appointments) that must render in the clinic's/patient's local zone rather
 * than the server's UTC clock.
 */
export function formatDateInZone(
  date: Date | string | null | undefined,
  timeZone: string,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

/** Formats a timestamp's TIME-of-day in a specific timezone. */
export function formatTimeInZone(
  date: Date | string | null | undefined,
  timeZone: string,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const suffix = diff < 0 ? "" : " ago";
  const prefix = diff < 0 ? "in " : "";
  const minutes = Math.round(diff / 60000);
  const absMinutes = Math.abs(minutes);
  if (absMinutes < 1) return "just now";
  if (absMinutes < 60) return `${prefix}${absMinutes}m${suffix}`;
  const hours = Math.round(minutes / 60);
  const absHours = Math.abs(hours);
  if (absHours < 24) return `${prefix}${absHours}h${suffix}`;
  const days = Math.round(hours / 24);
  const absDays = Math.abs(days);
  if (absDays < 7) return `${prefix}${absDays}d${suffix}`;
  return formatDate(d);
}

// Future-aware variant: renders "in 3d" for future dates and "3d ago"
// for past ones. Use for surfaces that may show either direction
// (e.g. an upcoming appointment widget).
export function formatFromNow(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const future = diffMs >= 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  if (minutes < 1) return "just now";
  const fmt = (n: number, unit: string) =>
    future ? `in ${n}${unit}` : `${n}${unit} ago`;
  if (minutes < 60) return fmt(minutes, "m");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return fmt(hours, "h");
  const days = Math.round(hours / 24);
  if (days < 7) return fmt(days, "d");
  return formatDate(d);
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/** Human label for a visit modality enum — never render the raw "in_person". */
export function formatModality(modality: string): string {
  switch (modality) {
    case "in_person":
    case "in-person":
      return "In-person";
    case "video":
      return "Video";
    case "phone":
      return "Phone";
    case "telehealth":
      return "Telehealth";
    default:
      return modality.replace(/_/g, "-");
  }
}

/** Modality phrase with the correct indefinite article ("an in-person", "a video"). */
export function modalityPhrase(modality: string): string {
  const label = formatModality(modality).toLowerCase();
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

/**
 * Provider display name with the person's name FIRST and credentials/specialty
 * after — "Dr. Lena Okafor, MD, Integrative Oncology" — instead of the
 * title-prefixed "MD, Integrative Oncology Dr. Lena Okafor".
 */
export function formatProviderName(provider: {
  name?: string | null;
  title?: string | null;
}): string {
  const name = (provider.name ?? "").trim();
  const title = (provider.title ?? "").trim();
  if (name && title) return `${name}, ${title}`;
  return name || title || "Your care team";
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatMoneyCompact(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
