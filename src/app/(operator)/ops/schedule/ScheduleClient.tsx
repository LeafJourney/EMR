"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { setPatientStatus } from "../patients/actions";
import {
  confirmAppointment,
  declineAppointment,
  rescheduleAppointment,
} from "./actions";

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

// EMR-919 — stable display order for the clickable modality KPI chips.
const MODALITY_ORDER = ["in_person", "video", "phone"];

// EMR-921 — clickable stat-ribbon scopes. Clicking a box retitles the Week View
// and filters the grid to that scope ("today" = appts dated today; the rest
// match appointment status). "In range" clears the scope.
type ScopeKey = "today" | "confirmed" | "requested" | "completed";
const SCOPES: { key: ScopeKey; label: string; tone: "accent" | "success" | "warning" | "neutral" }[] = [
  { key: "today", label: "Today", tone: "accent" },
  { key: "confirmed", label: "Confirmed", tone: "success" },
  { key: "requested", label: "Requested", tone: "warning" },
  { key: "completed", label: "Completed", tone: "neutral" },
];
const SCOPE_DOT: Record<ScopeKey, string> = {
  today: "bg-accent",
  confirmed: "bg-[color:var(--success,theme(colors.emerald.500))]",
  requested: "bg-highlight",
  completed: "bg-border-strong",
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
  patient: { id: string; firstName: string; lastName: string; status: string };
  // EMR-207 — no-show risk (null for already-resolved visits or low risk we don't surface).
  riskTier: "low" | "medium" | "high" | null;
  riskProbability: number | null;
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
  // EMR-919 / EMR-930 — modality filter driven by the clickable KPI chips.
  const [selectedModality, setSelectedModality] = useState<string | null>(null);
  // EMR-921 — stat-ribbon scope filter (Today / Confirmed / Requested / Completed).
  const [selectedScope, setSelectedScope] = useState<ScopeKey | null>(null);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  const totalThisWeek = appointments.length;

  // Modality counts across the loaded window — power the KPI chips.
  const modalityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of appointments) counts[a.modality] = (counts[a.modality] ?? 0) + 1;
    return counts;
  }, [appointments]);

  // EMR-921 — scope counts for the clickable stat ribbon.
  const scopeCounts = useMemo(() => {
    const todayStr = new Date().toDateString();
    return {
      today: appointments.filter(
        (a) => new Date(a.startAt).toDateString() === todayStr,
      ).length,
      confirmed: appointments.filter((a) => a.status === "confirmed").length,
      requested: appointments.filter((a) => a.status === "requested").length,
      completed: appointments.filter((a) => a.status === "completed").length,
    };
  }, [appointments]);

  // Restrict the day buckets by the active provider + modality filters so the
  // Week View grid reflects only the matching schedule.
  const visibleDays = useMemo(() => {
    if (!selectedProviderId && !selectedModality && !selectedScope) return days;
    const todayStr = new Date().toDateString();
    return days.map((d) => ({
      ...d,
      appointments: d.appointments.filter(
        (a) =>
          (!selectedProviderId || a.providerId === selectedProviderId) &&
          (!selectedModality || a.modality === selectedModality) &&
          (!selectedScope ||
            (selectedScope === "today"
              ? new Date(a.startAt).toDateString() === todayStr
              : a.status === selectedScope)),
      ),
    }));
  }, [days, selectedProviderId, selectedModality, selectedScope]);

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

  const scopeLabel = selectedScope
    ? SCOPES.find((s) => s.key === selectedScope)!.label
    : null;
  const boxTitle = selectedProvider
    ? `${selectedProvider.user.firstName} ${selectedProvider.user.lastName}`
    : scopeLabel ?? "Week view";

  return (
    <>
      {/* EMR-921 — clickable stat ribbon: a click retitles the Week View below
          and filters its grid to that scope; "In range" clears the filter. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        {[
          { key: null as ScopeKey | null, label: "In range", value: totalThisWeek, dotClass: "" },
          ...SCOPES.map((s) => ({
            key: s.key as ScopeKey | null,
            label: s.label,
            value: scopeCounts[s.key],
            dotClass: SCOPE_DOT[s.key],
          })),
        ].map((box) => {
          const active =
            box.key === null ? !selectedScope : selectedScope === box.key;
          return (
            <button
              key={box.label}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setSelectedScope(
                  box.key === null || selectedScope === box.key ? null : box.key,
                )
              }
              className={cn(
                "rounded-2xl border bg-surface-raised px-4 py-3 text-left shadow-sm transition-all",
                "hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                active
                  ? "border-accent/60 ring-1 ring-accent/40"
                  : "border-border/80 hover:border-border-strong",
              )}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-text-subtle">
                {box.dotClass && (
                  <span
                    className={cn("h-1.5 w-1.5 rounded-full", box.dotClass)}
                    aria-hidden
                  />
                )}
                {box.label}
              </span>
              <span className="mt-1 block font-display text-2xl text-text tabular-nums">
                {box.value}
              </span>
            </button>
          );
        })}
      </div>

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
          {!selectedProvider && selectedScope && (
            <button
              type="button"
              onClick={() => setSelectedScope(null)}
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

      {/* EMR-919 — clickable modality KPI chips that filter the calendar on click. */}
      {totalThisWeek > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {MODALITY_ORDER.filter((m) => modalityCounts[m]).map((m) => {
            const active = selectedModality === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedModality(active ? null : m)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-border text-text-muted hover:border-border-strong",
                )}
              >
                {MODALITY_LABEL[m] ?? m}:{" "}
                <span className="tabular-nums">{modalityCounts[m]}</span>
              </button>
            );
          })}
          {selectedModality && (
            <button
              type="button"
              onClick={() => setSelectedModality(null)}
              className="text-[11px] text-accent hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

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

// EMR-921 / EMR-578 — drag-to-reschedule week board. Each appointment card is
// draggable; each day column is a drop target. Dropping a card on another day
// optimistically moves it (re-grouped + re-sorted instantly), calls the
// rescheduleAppointment server action, and reverts on failure. EMR-577 adds a
// right-click "New visit" menu on each day's empty space.
function WeekGrid({ days }: { days: DayBucket[] }) {
  const router = useRouter();
  const [, startReschedule] = useTransition();
  // Optimistic day overrides while a reschedule is in flight: apptId -> day iso.
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverIso, setDragOverIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-group every appointment by its effective day (optimistic move applied)
  // so a dropped card jumps columns instantly and re-sorts by start time.
  const displayDays = useMemo(() => {
    const flat: { appt: SerializedAppointment; originIso: string }[] = [];
    for (const d of days) for (const a of d.appointments) flat.push({ appt: a, originIso: d.iso });
    return days.map((d) => ({
      ...d,
      appointments: flat
        .filter(({ appt, originIso }) => (moves[appt.id] ?? originIso) === d.iso)
        .map(({ appt }) => appt)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    }));
  }, [days, moves]);

  const cols = Math.min(7, Math.max(1, days.length));

  function originOf(id: string): string | undefined {
    return moves[id] ?? days.find((d) => d.appointments.some((a) => a.id === id))?.iso;
  }

  function handleDrop(targetIso: string) {
    const id = draggingId;
    setDragOverIso(null);
    setDraggingId(null);
    if (!id) return;
    const from = originOf(id);
    if (!from || from === targetIso) return;

    setMoves((m) => ({ ...m, [id]: targetIso }));
    setPending((p) => new Set(p).add(id));
    setError(null);
    startReschedule(async () => {
      const res = await rescheduleAppointment(id, targetIso);
      setPending((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
      if (!res.ok) {
        setMoves((m) => {
          const n = { ...m };
          delete n[id];
          return n;
        });
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div className={cn("grid grid-cols-1 gap-3", LG_COLS[cols])}>
        {displayDays.map((day) => (
          <DayColumn
            key={day.iso}
            day={day}
            isDropTarget={dragOverIso === day.iso}
            pending={pending}
            onDragOverColumn={() => setDragOverIso(day.iso)}
            onDragLeaveColumn={() => setDragOverIso((cur) => (cur === day.iso ? null : cur))}
            onDropColumn={() => handleDrop(day.iso)}
            onCardDragStart={(id) => setDraggingId(id)}
            onCardDragEnd={() => {
              setDraggingId(null);
              setDragOverIso(null);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// One week-view day column: droppable target + draggable appointment cards +
// a right-click "New visit" menu on empty space (EMR-577).
function DayColumn({
  day,
  isDropTarget,
  pending,
  onDragOverColumn,
  onDragLeaveColumn,
  onDropColumn,
  onCardDragStart,
  onCardDragEnd,
}: {
  day: DayBucket;
  isDropTarget: boolean;
  pending: Set<string>;
  onDragOverColumn: () => void;
  onDragLeaveColumn: () => void;
  onDropColumn: () => void;
  onCardDragStart: (id: string) => void;
  onCardDragEnd: () => void;
}) {
  const router = useRouter();
  const date = new Date(day.iso);
  const isToday = day.isToday;

  // EMR-577 — right-click empty day space to start a new visit on that day.
  const newVisitMenu: ContextMenuItem[] = [
    {
      label: `New visit · ${formatDayLabel(date)} ${formatDayNumber(date)}`,
      icon: ContextMenuIcons.Calendar,
      onSelect: (close) => {
        router.push(`/clinic/scheduling/book?date=${day.iso.slice(0, 10)}`);
        close();
      },
    },
  ];
  const { triggerProps, menu } = useContextMenu(newVisitMenu);

  return (
    <div
      className={cn(
        "bg-surface-raised rounded-xl border overflow-hidden flex flex-col transition-all",
        isToday ? "border-accent/50 shadow-md" : "border-border",
        isDropTarget && "ring-2 ring-accent ring-offset-1 border-accent",
      )}
    >
      {/* Day header */}
      <div
        className={cn(
          "px-4 py-3 border-b",
          isToday ? "bg-accent/10 border-accent/20" : "bg-surface-muted/40 border-border",
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
          <p className={cn("font-display text-lg", isToday ? "text-accent" : "text-text")}>
            {formatDayNumber(date)}
          </p>
        </div>
      </div>

      {/* Droppable appointments area */}
      <div
        {...triggerProps}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOverColumn();
        }}
        onDragLeave={onDragLeaveColumn}
        onDrop={(e) => {
          e.preventDefault();
          onDropColumn();
        }}
        className={cn(
          "p-2 space-y-1.5 flex-1 min-h-[240px] transition-colors",
          isDropTarget && "bg-accent/5",
        )}
      >
        {day.appointments.length === 0 ? (
          <p
            className={cn(
              "text-[11px] text-center py-4",
              isDropTarget ? "text-accent font-medium" : "text-text-subtle italic",
            )}
          >
            {isDropTarget ? "Drop to move here" : "No visits"}
          </p>
        ) : (
          day.appointments.map((appt) => {
            const isPending = pending.has(appt.id);
            return (
              <div
                key={appt.id}
                draggable={!isPending}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", appt.id);
                  onCardDragStart(appt.id);
                }}
                onDragEnd={onCardDragEnd}
                // Right-clicks on a card open the card's own menu — don't also
                // open this column's "new visit" menu.
                onContextMenu={(e) => e.stopPropagation()}
                className={cn(
                  "cursor-grab active:cursor-grabbing",
                  isPending && "opacity-50 pointer-events-none",
                )}
                title="Drag to another day to reschedule"
              >
                <AppointmentCard appt={appt} />
              </div>
            );
          })
        )}
      </div>
      {menu}
    </div>
  );
}

// EMR-943 — color-coded patient status bubble (active/inactive/prospect).
const PATIENT_STATUS_TONE: Record<string, "success" | "accent" | "neutral" | "warning"> = {
  active: "success",
  prospect: "accent",
  inactive: "neutral",
};

function PatientStatusBubble({ status }: { status: string }) {
  const tone = PATIENT_STATUS_TONE[status.toLowerCase()] ?? "warning";
  return (
    <Badge tone={tone} className="text-[9px] capitalize">
      {status}
    </Badge>
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
  const [, startStatusChange] = useTransition();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // EMR-939 — change the patient's lifecycle status from the schedule board,
  // reusing the roster's setPatientStatus action; refresh to reflect the bubble.
  function changeStatus(status: string, close: () => void) {
    close();
    startStatusChange(async () => {
      await setPatientStatus(appt.patient.id, status);
      router.refresh();
    });
  }

  // EMR-1085 — action a patient-requested booking right from the card.
  function runStatusChange(
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Could not update the appointment.");
      else router.refresh();
    });
  }

  const menuItems: ContextMenuItem[] = [
    {
      label: `Schedule ${appt.patient.firstName} ${appt.patient.lastName}`,
      icon: ContextMenuIcons.Calendar,
      onSelect: (close) => {
        router.push(`/clinic/schedule?patientId=${appt.patient.id}`);
        close();
      },
    },
    { divider: true, label: "" },
    {
      label: "Change status",
      icon: ContextMenuIcons.Check,
      subItems: [
        { label: "Mark active", onSelect: (close: () => void) => changeStatus("active", close) },
        { label: "Mark prospect", onSelect: (close: () => void) => changeStatus("prospect", close) },
        { label: "Mark inactive", onSelect: (close: () => void) => changeStatus("inactive", close) },
      ],
    },
  ];
  // Only a still-requested booking can be confirmed or declined.
  if (appt.status === "requested") {
    menuItems.push(
      {
        label: "Confirm appointment",
        icon: ContextMenuIcons.Check,
        onSelect: () =>
          runStatusChange(() => confirmAppointment({ appointmentId: appt.id })),
      },
      {
        label: "Decline request",
        danger: true,
        onSelect: () =>
          runStatusChange(() => declineAppointment({ appointmentId: appt.id })),
      },
    );
  }
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
          {/* EMR-923 — patient name links through to the chart home page. */}
          <Link
            href={`/clinic/patients/${appt.patient.id}`}
            draggable={false}
            onClick={(e) => e.stopPropagation()}
            className="block text-xs font-medium text-text truncate hover:text-accent hover:underline"
          >
            {appt.patient.firstName} {appt.patient.lastName}
          </Link>
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
        {/* EMR-943 — color-coded patient status bubble */}
        <PatientStatusBubble status={appt.patient.status} />
        <NoShowRiskBadge tier={appt.riskTier} probability={appt.riskProbability} />
        {/* EMR-920 — inline insurance-eligibility helper tag on upcoming visits. */}
        {(appt.status === "requested" || appt.status === "confirmed") && (
          <Link
            href="/ops/eligibility"
            className="inline-flex"
            title="Check insurance eligibility for this visit."
          >
            <Badge tone="info" className="text-[9px] hover:bg-blue-100">
              ⊕ Verify insurance
            </Badge>
          </Link>
        )}
      </div>

      {/* EMR-1085 — confirm/decline a patient-requested booking inline. */}
      {appt.status === "requested" && (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              runStatusChange(() => confirmAppointment({ appointmentId: appt.id }))
            }
            className="rounded-md bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              runStatusChange(() => declineAppointment({ appointmentId: appt.id }))
            }
            className="rounded-md px-2 py-0.5 text-[10px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[10px] text-danger">{error}</p>}
      {menu}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EMR-207 — No-show risk pill. Surfaces the predicted no-show probability for
// medium/high-risk upcoming visits so the front desk knows where to spend an
// extra reminder. Low risk is intentionally silent to keep the board calm.
// ---------------------------------------------------------------------------

function NoShowRiskBadge({
  tier,
  probability,
}: {
  tier: "low" | "medium" | "high" | null;
  probability: number | null;
}) {
  if (tier === null || tier === "low" || probability === null) return null;
  const pct = Math.round(probability * 100);
  const tone = tier === "high" ? "danger" : "warning";
  const label = tier === "high" ? "High no-show risk" : "Elevated no-show risk";
  return (
    <Badge
      tone={tone}
      className="text-[9px]"
      title={`${label} — ${pct}% predicted. Consider an extra reminder or live confirm.`}
    >
      ⚠ {pct}%
    </Badge>
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
