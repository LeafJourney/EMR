import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  ScheduleClient,
  type SerializedAppointment,
  type SerializedProvider,
} from "./ScheduleClient";
import type { RangeKey } from "./RangeFilter";

export const metadata = { title: "Schedule" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startOfWeek(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  n.setDate(n.getDate() - n.getDay());
  return n;
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Parse `YYYY-MM-DD` into a LOCAL Date at midnight, else null. */
function parseISODate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setHours(0, 0, 0, 0);
  if (
    d.getFullYear() !== Number(m[1]) ||
    d.getMonth() !== Number(m[2]) - 1 ||
    d.getDate() !== Number(m[3])
  ) {
    return null;
  }
  return d;
}

// ---------------------------------------------------------------------------
// EMR-930 — resolve the query window from searchParams.
//
// Supported:
//   ?range=today|week|next-week|prev-week   (preset, computed from "now")
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD          (explicit custom span, inclusive)
//   (none)                                  → current week (preserves default)
//
// Returns a [start, end) window plus the active key for the filter control.
// ---------------------------------------------------------------------------

type ResolvedRange = {
  start: Date;
  end: Date; // exclusive
  activeRange: RangeKey;
  activeFrom: string | null;
  activeTo: string | null;
};

function resolveRange(
  rangeParam: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined,
  now: Date,
): ResolvedRange {
  // Explicit custom span takes precedence.
  const from = parseISODate(fromParam);
  const to = parseISODate(toParam);
  if (from && to) {
    const [a, b] = from.getTime() <= to.getTime() ? [from, to] : [to, from];
    return {
      start: a,
      end: addDays(b, 1), // make `to` inclusive
      activeRange: "custom",
      activeFrom: isoOf(a),
      activeTo: isoOf(b),
    };
  }

  const thisWeekStart = startOfWeek(now);
  switch (rangeParam) {
    case "today": {
      const start = startOfDay(now);
      return {
        start,
        end: addDays(start, 1),
        activeRange: "today",
        activeFrom: null,
        activeTo: null,
      };
    }
    case "next-week": {
      const start = addDays(thisWeekStart, 7);
      return {
        start,
        end: addDays(start, 7),
        activeRange: "next-week",
        activeFrom: null,
        activeTo: null,
      };
    }
    case "prev-week": {
      const start = addDays(thisWeekStart, -7);
      return {
        start,
        end: addDays(start, 7),
        activeRange: "prev-week",
        activeFrom: null,
        activeTo: null,
      };
    }
    case "week":
    default:
      return {
        start: thisWeekStart,
        end: addDays(thisWeekStart, 7),
        activeRange: "week",
        activeFrom: null,
        activeTo: null,
      };
  }
}

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeSpanLabel(start: Date, end: Date): string {
  // end is exclusive; show the inclusive last day.
  const lastDay = addDays(end, -1);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (isSameDay(start, lastDay)) {
    return start.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  return `${start.toLocaleDateString("en-US", opts)} – ${lastDay.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SchedulePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  const sp = (await searchParams) ?? {};
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const now = new Date();
  const { start, end, activeRange, activeFrom, activeTo } = resolveRange(
    one(sp.range),
    one(sp.from),
    one(sp.to),
    now,
  );

  const [appointments, providers] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        patient: { organizationId },
        startAt: { gte: start, lt: end },
      },
      include: {
        patient: { select: { firstName: true, lastName: true, id: true } },
        provider: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.provider.findMany({
      where: { organizationId, active: true },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  // Day buckets that span the resolved window (1+ days).
  const dayCount = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000),
  );
  const dayBuckets = Array.from({ length: dayCount }, (_, i) => {
    const d = addDays(start, i);
    return {
      iso: d.toISOString(),
      isToday: isSameDay(d, now),
      appointments: appointments
        .filter((a) => isSameDay(a.startAt, d))
        .map(serializeAppointment),
    };
  });

  const serializedAppointments: SerializedAppointment[] =
    appointments.map(serializeAppointment);

  const serializedProviders: SerializedProvider[] = providers.map((p) => ({
    id: p.id,
    title: p.title ?? null,
    user: { firstName: p.user.firstName, lastName: p.user.lastName },
  }));

  // Stats (reflect the chosen window).
  const totalThisWeek = appointments.length;
  const confirmedCount = appointments.filter(
    (a) => a.status === "confirmed",
  ).length;
  const requestedCount = appointments.filter(
    (a) => a.status === "requested",
  ).length;
  const completedCount = appointments.filter(
    (a) => a.status === "completed",
  ).length;
  const todayCount = appointments.filter((a) => isSameDay(a.startAt, now)).length;

  const spanLabel = rangeSpanLabel(start, end);

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Practice management"
        title="Schedule"
        description={spanLabel}
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="In range" value={totalThisWeek} />
        <StatCard label="Today" value={todayCount} tone="accent" />
        <StatCard label="Confirmed" value={confirmedCount} tone="success" />
        <StatCard label="Requested" value={requestedCount} tone="warning" />
        <StatCard label="Completed" value={completedCount} tone="neutral" />
      </div>

      <ScheduleClient
        rangeLabel={spanLabel}
        activeRange={activeRange}
        activeFrom={activeFrom}
        activeTo={activeTo}
        days={dayBuckets}
        appointments={serializedAppointments}
        providers={serializedProviders}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Serialization — Date → ISO string before crossing to the client component.
// ---------------------------------------------------------------------------

type ApptRow = {
  id: string;
  startAt: Date;
  status: string;
  modality: string;
  providerId: string | null;
  patient: { id: string; firstName: string; lastName: string };
};

function serializeAppointment(a: ApptRow): SerializedAppointment {
  return {
    id: a.id,
    startAt: a.startAt.toISOString(),
    status: a.status,
    modality: a.modality,
    providerId: a.providerId,
    patient: {
      id: a.patient.id,
      firstName: a.patient.firstName,
      lastName: a.patient.lastName,
    },
  };
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "accent" | "success" | "warning" | "neutral";
}) {
  const colors = {
    accent: "text-accent",
    success: "text-success",
    warning: "text-[color:var(--warning)]",
    neutral: "text-text",
  };
  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <p className={`font-display text-3xl tabular-nums ${colors[tone]}`}>
          {value}
        </p>
        <p className="text-xs text-text-muted mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
