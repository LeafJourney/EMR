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
