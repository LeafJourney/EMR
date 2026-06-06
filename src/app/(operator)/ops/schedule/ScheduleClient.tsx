"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/ornament";
import {
  useContextMenu,
  ContextMenuIcons,
  type ContextMenuItem,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils/cn";
import { RangeFilter, type RangeKey } from "./RangeFilter";

// ---------------------------------------------------------------------------
// EMR-936 — Clickable "Providers this week" cards → provider snapshot in the
// Week View box. Client wrapper that holds the selected provider id, swaps the
// Week View box content + title in place (no added scrolling), and shows a
// selected state on the active provider card.
//
// All appointment data for the window is loaded server-side and passed here
// serialized (Date → ISO string). We re-hydrate startAt to a Date locally.
// ---------------------------------------------------------------------------

const MODALITY_LABEL: Record<string, string> = {
  in_person: "In-person",
  video: "Video",
  phone: "Phone",
};

const MODALITY_TONE: Record<string, "accent" | "info" | "neutral"> = {
  in_person: "accent",
  video: "info",
  phone: "neutral",
};

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "neutral" | "accent"
> = {
  confirmed: "success",
  requested: "warning",
  completed: "neutral",
  cancelled: "danger",
  no_show: "danger",
};

export type SerializedAppointment = {
  id: string;
  startAt: string; // ISO string
  status: string;
  modality: string;
  providerId: string | null;
  patient: { id: string; firstName: string; lastName: string };
};

export type SerializedProvider = {
  id: string;
  title: string | null;
  user: { firstName: string; lastName: string };
};

type DayBucket = {
  iso: string;
  appointments: SerializedAppointment[];
  isToday: boolean;
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function formatDayNumber(d: Date): string {
  return d.getDate().toString();
}

export function ScheduleClient({
  rangeLabel,
  activeRange,
  activeFrom,
  activeTo,
  days,
  appointments,
  providers,
}: {
  /** Human-readable date span for the header. */
  rangeLabel: string;
  activeRange: RangeKey;
  activeFrom: string | null;
  activeTo: string | null;
  /** Pre-bucketed days (ISO strings), one per day in the window. */
  days: DayBucket[];
  /** All appointments in the window (for provider snapshot counts). */
  appointments: SerializedAppointment[];
  providers: SerializedProvider[];
}) {
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null,
  );

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const totalThisWeek = appointments.length;

  // When a provider is selected, restrict the day buckets to that provider so
  // the Week View grid reflects only their schedule.
  const visibleDays = useMemo(() => {
    if (!selectedProviderId) return days;
    return days.map((d) => ({
      ...d,
      appointments: d.appointments.filter(
        (a) => a.providerId === selectedProviderId,
      ),
    }));
  }, [days, selectedProviderId]);

  // Snapshot stats for the selected provider, computed from loaded data.
  const snapshot = useMemo(() => {
    if (!selectedProviderId) return null;
    const todayIso = new Date().toDateString();
    const appts = appointments.filter(
      (a) => a.providerId === selectedProviderId,
    );
    return {
      total: appts.length,
      today: appts.filter(
        (a) => new Date(a.startAt).toDateString() === todayIso,
      ).length,
      confirmed: appts.filter((a) => a.status === "confirmed").length,
      requested: appts.filter((a) => a.status === "requested").length,
      completed: appts.filter((a) => a.status === "completed").length,
    };
  }, [appointments, selectedProviderId]);

  const boxTitle = selectedProvider
    ? `${selectedProvider.user.firstName} ${selectedProvider.user.lastName}`
    : "Week view";

  return (
    <>
      {/* Week view header — title (swaps to provider name) + range filter */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <Eyebrow>{boxTitle}</Eyebrow>
          <span className="text-xs text-text-subtle truncate">
            {selectedProvider ? selectedProvider.title ?? "Provider" : rangeLabel}
          </span>
          {selectedProvider && (
            <button
              type="button"
              onClick={() => setSelectedProviderId(null)}
              className="text-[11px] font-medium text-accent hover:underline shrink-0"
            >
              Back to all
            </button>
          )}
        </div>
        <div className="shrink-0">
          <RangeFilter
            activeRange={activeRange}
            activeFrom={activeFrom}
            activeTo={activeTo}
          />
        </div>
      </div>

      {/* Week View box — either the full grid, or the provider snapshot. */}
      {selectedProvider && snapshot ? (
        <ProviderSnapshot
          snapshot={snapshot}
          days={visibleDays}
        />
      ) : totalThisWeek === 0 ? (
        <EmptyState
          title="No appointments in this range"
          description="New appointments will appear here as patients book or providers schedule."
        />
      ) : (
        <WeekGrid days={visibleDays} />
      )}

      {/* Provider legend — clickable cards */}
      {providers.length > 0 && (
        <div className="mt-10">
          <Eyebrow className="mb-3">Providers this week</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {providers.map((provider) => {
              const providerAppts = appointments.filter(
                (a) => a.providerId === provider.id,
              );
              const isSelected = provider.id === selectedProviderId;
              return (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() =>
                    setSelectedProviderId(isSelected ? null : provider.id)
                  }
                  aria-pressed={isSelected}
                  className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-xl"
                >
                  <Card
                    tone="raised"
                    className={cn(
                      "transition-colors cursor-pointer hover:border-accent/40",
                      isSelected && "border-accent/60 ring-1 ring-accent/40",
                    )}
                  >
                    <CardContent className="pt-5 pb-5">
                      <div className="flex items-center gap-3">
                        <Avatar
                          firstName={provider.user.firstName}
                          lastName={provider.user.lastName}
                          size="md"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text truncate">
                            {provider.user.firstName} {provider.user.lastName}
                          </p>
                          <p className="text-xs text-text-muted truncate">
                            {provider.title ?? "Provider"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-display text-xl text-accent tabular-nums">
                            {providerAppts.length}
                          </p>
                          <p className="text-[10px] text-text-subtle">visits</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Week grid — the default Week View box content.
// ---------------------------------------------------------------------------

// Static class strings so Tailwind's JIT keeps them — never interpolate.
const LG_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
  7: "lg:grid-cols-7",
};

const BASE_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-7",
};

function WeekGrid({ days }: { days: DayBucket[] }) {
  // Span up to 7 columns; shorter windows (e.g. "Today") use fewer.
  const cols = Math.min(7, Math.max(1, days.length));
  return (
    <div className={cn("grid grid-cols-1 gap-3", LG_COLS[cols])}>
      {days.map((day) => {
        const date = new Date(day.iso);
        const isToday = day.isToday;
        return (
          <div
            key={day.iso}
            className={cn(
              "bg-surface-raised rounded-xl border overflow-hidden flex flex-col",
              isToday ? "border-accent/50 shadow-md" : "border-border",
            )}
          >
            {/* Day header */}
            <div
              className={cn(
                "px-4 py-3 border-b",
                isToday
                  ? "bg-accent/10 border-accent/20"
                  : "bg-surface-muted/40 border-border",
              )}
            >
              <div className="flex items-baseline justify-between">
                <p
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wider",
                    isToday ? "text-accent" : "text-text-subtle",
                  )}
                >
                  {formatDayLabel(date)}
                  {isToday && " · Today"}
                </p>
                <p
                  className={cn(
                    "font-display text-lg",
                    isToday ? "text-accent" : "text-text",
                  )}
                >
                  {formatDayNumber(date)}
                </p>
              </div>
            </div>

            {/* Appointments */}
            <div className="p-2 space-y-1.5 flex-1 min-h-[240px]">
              {day.appointments.length === 0 ? (
                <p className="text-[11px] text-text-subtle text-center py-4 italic">
                  No visits
                </p>
              ) : (
                day.appointments.map((appt) => (
                  <AppointmentCard key={appt.id} appt={appt} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EMR-927 — Appointment card with a right-click context menu. The "Schedule"
// item navigates to /clinic/schedule?patientId=<id> so the operator lands on
// the clinic scheduler scoped to that patient. Reuses the shared
// `useContextMenu` hook already used by the patients roster.
// ---------------------------------------------------------------------------

function AppointmentCard({ appt }: { appt: SerializedAppointment }) {
  const router = useRouter();

  const menuItems: ContextMenuItem[] = [
    {
      label: `Schedule ${appt.patient.firstName} ${appt.patient.lastName}`,
      icon: ContextMenuIcons.Calendar,
      onSelect: (close) => {
        router.push(`/clinic/schedule?patientId=${appt.patient.id}`);
        close();
      },
    },
  ];
  const { triggerProps, menu } = useContextMenu(menuItems);

  return (
    <div
      {...triggerProps}
      className="rounded-lg border border-border/60 bg-surface p-2.5 hover:border-accent/40 transition-colors"
    >
      <div className="flex items-start gap-2">
        <Avatar
          firstName={appt.patient.firstName}
          lastName={appt.patient.lastName}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text truncate">
            {appt.patient.firstName} {appt.patient.lastName}
          </p>
          <p className="text-[10px] text-text-subtle tabular-nums">
            {formatTime(new Date(appt.startAt))}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 mt-2 flex-wrap">
        <Badge
          tone={MODALITY_TONE[appt.modality] ?? "neutral"}
          className="text-[9px]"
        >
          {MODALITY_LABEL[appt.modality] ?? appt.modality}
        </Badge>
        <Badge
          tone={STATUS_TONE[appt.status] ?? "neutral"}
          className="text-[9px]"
        >
          {appt.status}
        </Badge>
      </div>
      {menu}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider snapshot — swaps into the Week View box. Compact: a stat row plus
// a slim per-day breakdown so the section stays on one static screen.
// ---------------------------------------------------------------------------

function ProviderSnapshot({
  snapshot,
  days,
}: {
  snapshot: {
    total: number;
    today: number;
    confirmed: number;
    requested: number;
    completed: number;
  };
  days: DayBucket[];
}) {
  return (
    <div className="bg-surface-raised rounded-xl border border-border overflow-hidden">
      {/* Stat row */}
      <div className="grid grid-cols-3 md:grid-cols-5 divide-x divide-border border-b border-border">
        <SnapshotStat label="In range" value={snapshot.total} tone="text" />
        <SnapshotStat label="Today" value={snapshot.today} tone="accent" />
        <SnapshotStat
          label="Confirmed"
          value={snapshot.confirmed}
          tone="success"
        />
        <SnapshotStat
          label="Requested"
          value={snapshot.requested}
          tone="warning"
        />
        <SnapshotStat
          label="Completed"
          value={snapshot.completed}
          tone="muted"
        />
      </div>

      {/* Per-day breakdown — slim row, no scrolling */}
      <div className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-subtle mb-3">
          Daily breakdown
        </p>
        <div
          className={cn(
            "grid gap-2",
            BASE_COLS[Math.min(7, Math.max(1, days.length))],
          )}
        >
          {days.map((day) => {
            const date = new Date(day.iso);
            const count = day.appointments.length;
            const isToday = day.isToday;
            return (
              <div
                key={day.iso}
                className={cn(
                  "rounded-lg border px-2 py-3 text-center",
                  isToday
                    ? "border-accent/50 bg-accent/10"
                    : "border-border bg-surface",
                )}
              >
                <p
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wider",
                    isToday ? "text-accent" : "text-text-subtle",
                  )}
                >
                  {formatDayLabel(date)}
                </p>
                <p
                  className={cn(
                    "font-display text-xl tabular-nums mt-1",
                    count === 0
                      ? "text-text-subtle"
                      : isToday
                        ? "text-accent"
                        : "text-text",
                  )}
                >
                  {count}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SnapshotStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "text" | "accent" | "success" | "warning" | "muted";
}) {
  const colors: Record<"text" | "accent" | "success" | "warning" | "muted", string> = {
    text: "text-text",
    accent: "text-accent",
    success: "text-success",
    warning: "text-[color:var(--warning)]",
    muted: "text-text-muted",
  };
  return (
    <div className="px-4 py-4">
      <p className={cn("font-display text-2xl tabular-nums", colors[tone])}>
        {value}
      </p>
      <p className="text-[11px] text-text-muted mt-0.5">{label}</p>
    </div>
  );
}
