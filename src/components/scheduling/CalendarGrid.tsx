"use client";

// EMR-182 — Schedule calendar grid.
//
// Reusable day / week / month views with square 30-minute time blocks,
// drag-to-create on empty cells, and drag-to-reschedule on existing
// appointments. Color is keyed by visit modality (video, in_person,
// phone). A provider filter trims the rendered set client-side, and
// /print suppresses the toolbar so a clinic can paper-print today's
// roster.

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";

export type CalendarView = "day" | "week" | "month";

export interface CalendarAppointment {
  id: string;
  patientId: string;
  patientName: string;
  providerId: string | null;
  providerName: string | null;
  startAtIso: string;
  endAtIso: string;
  status: string;
  modality: string;
  notes: string | null;
}

export interface CalendarProvider {
  id: string;
  name: string;
}

export interface CalendarPatient {
  id: string;
  name: string;
}

export interface CalendarGridProps {
  /** Anchor date — the grid frames the week/day/month containing this. */
  anchorIso: string;
  appointments: CalendarAppointment[];
  providers: CalendarProvider[];
  /** Patient list used by the drag-to-create dialog. */
  patients: CalendarPatient[];
  /** Initial view (URL-driven). */
  initialView?: CalendarView;
  /** Initial provider filter id. */
  initialProviderId?: string | null;
  /** Render in print mode — hides toolbar, fits to page. */
  printMode?: boolean;
  /**
   * Server-action wrappers — passed in so the grid is reusable across
   * pages without import cycles.
   */
  onCreate: (input: {
    patientId: string;
    providerId: string | null;
    startIso: string;
    durationMinutes: number;
    modality: "video" | "in_person" | "phone";
    notes?: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
  onReschedule: (input: {
    appointmentId: string;
    newStartIso: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const FIRST_HOUR = 7;
const LAST_HOUR = 19;
const SLOT_MIN = 30;
const SLOTS_PER_HOUR = 60 / SLOT_MIN;
const TOTAL_SLOTS = (LAST_HOUR - FIRST_HOUR) * SLOTS_PER_HOUR;
const SQUARE = 36; // px — keeps cells visually square

const MODALITY_TONE: Record<
  string,
  { dot: string; chip: string; label: string }
> = {
  video: {
    dot: "bg-info",
    chip: "bg-blue-50 border-blue-200 text-info",
    label: "Video",
  },
  in_person: {
    dot: "bg-accent",
    chip: "bg-accent-soft border-accent/30 text-accent",
    label: "In person",
  },
  phone: {
    dot: "bg-[color:var(--highlight-hover)]",
    chip: "bg-highlight-soft border-highlight/30 text-[color:var(--highlight-hover)]",
    label: "Phone",
  },
};

const DEFAULT_TONE = {
  dot: "bg-text-subtle",
  chip: "bg-surface-muted border-border-strong/40 text-text-muted",
  label: "Visit",
};

const toneFor = (modality: string) => MODALITY_TONE[modality] ?? DEFAULT_TONE;

export function CalendarGrid({
  anchorIso,
  appointments,
  providers,
  patients,
  initialView = "week",
  initialProviderId = null,
  printMode = false,
  onCreate,
  onReschedule,
}: CalendarGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = React.useState<CalendarView>(initialView);
  const [providerId, setProviderId] = React.useState<string | null>(
    initialProviderId,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState<{
    startIso: string;
  } | null>(null);

  const anchor = React.useMemo(() => new Date(anchorIso), [anchorIso]);

  const filtered = React.useMemo(() => {
    if (!providerId) return appointments;
    return appointments.filter((a) => a.providerId === providerId);
  }, [appointments, providerId]);

  const updateUrl = React.useCallback(
    (next: { view?: CalendarView; providerId?: string | null; date?: Date }) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (next.view) params.set("view", next.view);
      if ("providerId" in next) {
        if (next.providerId) params.set("provider", next.providerId);
        else params.delete("provider");
      }
      if (next.date) params.set("date", next.date.toISOString().slice(0, 10));
      router.push(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const reschedule = async (appointmentId: string, newStart: Date) => {
    setError(null);
    setPending(true);
    try {
      const r = await onReschedule({
        appointmentId,
        newStartIso: newStart.toISOString(),
      });
      if (!r.ok) setError(r.error ?? "Could not reschedule.");
      else router.refresh();
    } finally {
      setPending(false);
    }
  };

  const submitCreate = async (
    formData: FormData,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!createDraft) return { ok: false, error: "No draft." };
    const patientId = String(formData.get("patientId") ?? "");
    const provider = String(formData.get("providerId") ?? "");
    const modality = String(formData.get("modality") ?? "video") as
      | "video"
      | "in_person"
      | "phone";
    const duration = Number(formData.get("durationMinutes") ?? 30);
    const notes = String(formData.get("notes") ?? "") || null;
    if (!patientId) return { ok: false, error: "Pick a patient." };

    setPending(true);
    setError(null);
    try {
      const r = await onCreate({
        patientId,
        providerId: provider || null,
        startIso: createDraft.startIso,
        durationMinutes: duration,
        modality,
        notes,
      });
      if (!r.ok) {
        setError(r.error ?? "Could not create appointment.");
        return { ok: false, error: r.error };
      }
      setCreateDraft(null);
      router.refresh();
      return { ok: true };
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={cn("space-y-4", printMode && "print:space-y-2")}
      data-print-mode={printMode || undefined}
    >
      {!printMode && (
        <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
          <div className="inline-flex rounded-lg border border-border bg-surface p-1">
            {(["day", "week", "month"] as CalendarView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setView(v);
                  updateUrl({ view: v });
                }}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md capitalize transition-colors",
                  view === v
                    ? "bg-accent text-accent-ink"
                    : "text-text-muted hover:text-text",
                )}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              className="h-8 px-2 text-xs rounded-md border border-border-strong bg-surface"
              value={providerId ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                setProviderId(val);
                updateUrl({ providerId: val });
              }}
            >
              <option value="">All providers</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateUrl({ date: shiftAnchor(anchor, view, -1) })
              }
            >
              ← Prev
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateUrl({ date: new Date() })}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                updateUrl({ date: shiftAnchor(anchor, view, 1) })
              }
            >
              Next →
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.print()}
            >
              Print
            </Button>
          </div>
        </div>
      )}

      <ModalityLegend />

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger print:hidden">
          {error}
        </div>
      )}

      {view === "week" && (
        <WeekView
          weekStart={startOfWeek(anchor)}
          appointments={filtered}
          pending={pending}
          onAppointmentDrop={(apptId, dayIdx, slotIdx) => {
            const newStart = new Date(startOfWeek(anchor));
            newStart.setDate(newStart.getDate() + dayIdx);
            newStart.setHours(FIRST_HOUR, slotIdx * SLOT_MIN, 0, 0);
            void reschedule(apptId, newStart);
          }}
          onSlotCreate={(dayIdx, slotIdx) => {
            const startAt = new Date(startOfWeek(anchor));
            startAt.setDate(startAt.getDate() + dayIdx);
            startAt.setHours(FIRST_HOUR, slotIdx * SLOT_MIN, 0, 0);
            setCreateDraft({ startIso: startAt.toISOString() });
          }}
        />
      )}

      {view === "day" && (
        <DayView
          day={startOfDay(anchor)}
          appointments={filtered.filter((a) =>
            sameDay(new Date(a.startAtIso), startOfDay(anchor)),
          )}
          pending={pending}
          onAppointmentDrop={(apptId, slotIdx) => {
            const newStart = new Date(startOfDay(anchor));
            newStart.setHours(FIRST_HOUR, slotIdx * SLOT_MIN, 0, 0);
            void reschedule(apptId, newStart);
          }}
          onSlotCreate={(slotIdx) => {
            const startAt = new Date(startOfDay(anchor));
            startAt.setHours(FIRST_HOUR, slotIdx * SLOT_MIN, 0, 0);
            setCreateDraft({ startIso: startAt.toISOString() });
          }}
        />
      )}

      {view === "month" && (
        <MonthView
          monthStart={startOfMonth(anchor)}
          appointments={filtered}
          onDayClick={(day) => {
            updateUrl({ view: "day", date: day });
            setView("day");
          }}
        />
      )}

      {createDraft && !printMode && (
        <CreateDialog
          startIso={createDraft.startIso}
          providers={providers}
          patients={patients}
          defaultProviderId={providerId}
          onClose={() => setCreateDraft(null)}
          onSubmit={submitCreate}
          pending={pending}
        />
      )}
    </div>
  );
}

// ── Legend ──────────────────────────────────────────────────────────

function ModalityLegend() {
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px] text-text-subtle">
      {Object.entries(MODALITY_TONE).map(([key, t]) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", t.dot)} />
          {t.label}
        </span>
      ))}
    </div>
  );
}

// ── Week view ───────────────────────────────────────────────────────

function WeekView({
  weekStart,
  appointments,
  pending,
  onAppointmentDrop,
  onSlotCreate,
}: {
  weekStart: Date;
  appointments: CalendarAppointment[];
  pending: boolean;
  onAppointmentDrop: (apptId: string, dayIdx: number, slotIdx: number) => void;
  onSlotCreate: (dayIdx: number, slotIdx: number) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-4 overflow-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `60px repeat(7, minmax(120px, 1fr))`,
          }}
        >
          <div className="h-8" />
          {DAYS.map((d, idx) => {
            const date = addDays(weekStart, idx);
            const isToday = sameDay(date, new Date());
            return (
              <div
                key={d}
                className={cn(
                  "h-8 flex items-center justify-center text-[11px] uppercase tracking-wider border-b border-border",
                  isToday ? "text-accent font-semibold" : "text-text-subtle",
                )}
              >
                {d} {date.getDate()}
              </div>
            );
          })}

          {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
            const hour = FIRST_HOUR + Math.floor(slotIdx / SLOTS_PER_HOUR);
            const min = (slotIdx % SLOTS_PER_HOUR) * SLOT_MIN;
            const isHourMark = min === 0;
            return (
              <React.Fragment key={slotIdx}>
                <div
                  className={cn(
                    "text-[10px] tabular-nums text-text-subtle pr-2 text-right",
                    isHourMark ? "border-t border-border/60" : "",
                  )}
                  style={{ height: SQUARE }}
                >
                  {isHourMark ? `${hour}:00` : ""}
                </div>
                {DAYS.map((_, dayIdx) => (
                  <Slot
                    key={`${dayIdx}:${slotIdx}`}
                    appointment={findAppt(
                      appointments,
                      weekStart,
                      dayIdx,
                      slotIdx,
                    )}
                    pending={pending}
                    hourMark={isHourMark}
                    onAppointmentDrop={(apptId) =>
                      onAppointmentDrop(apptId, dayIdx, slotIdx)
                    }
                    onCreate={() => onSlotCreate(dayIdx, slotIdx)}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Day view ────────────────────────────────────────────────────────

function DayView({
  day,
  appointments,
  pending,
  onAppointmentDrop,
  onSlotCreate,
}: {
  day: Date;
  appointments: CalendarAppointment[];
  pending: boolean;
  onAppointmentDrop: (apptId: string, slotIdx: number) => void;
  onSlotCreate: (slotIdx: number) => void;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] uppercase tracking-wider text-text-subtle font-medium mb-3">
          {day.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <div className="grid" style={{ gridTemplateColumns: `60px 1fr` }}>
          {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
            const hour = FIRST_HOUR + Math.floor(slotIdx / SLOTS_PER_HOUR);
            const min = (slotIdx % SLOTS_PER_HOUR) * SLOT_MIN;
            const isHourMark = min === 0;
            const slotStart = new Date(day);
            slotStart.setHours(hour, min, 0, 0);
            const inSlot =
              appointments.find(
                (a) =>
                  new Date(a.startAtIso).getTime() === slotStart.getTime(),
              ) ?? null;
            return (
              <React.Fragment key={slotIdx}>
                <div
                  className="text-[10px] tabular-nums text-text-subtle pr-2 text-right"
                  style={{ height: SQUARE }}
                >
                  {isHourMark ? `${hour}:00` : ""}
                </div>
                <Slot
                  appointment={inSlot}
                  pending={pending}
                  hourMark={isHourMark}
                  onAppointmentDrop={(apptId) =>
                    onAppointmentDrop(apptId, slotIdx)
                  }
                  onCreate={() => onSlotCreate(slotIdx)}
                />
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Month view ──────────────────────────────────────────────────────

function MonthView({
  monthStart,
  appointments,
  onDayClick,
}: {
  monthStart: Date;
  appointments: CalendarAppointment[];
  onDayClick: (day: Date) => void;
}) {
  const gridStart = startOfWeek(monthStart);
  const cells = Array.from({ length: 42 }).map((_, i) => addDays(gridStart, i));
  const today = new Date();
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-[11px] uppercase tracking-wider text-text-subtle font-medium mb-3">
          {monthStart.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          })}
        </p>
        <div className="grid grid-cols-7 gap-px bg-border/60 border border-border rounded-lg overflow-hidden">
          {DAYS.map((d) => (
            <div
              key={d}
              className="bg-surface px-2 py-1 text-[11px] uppercase tracking-wider text-text-subtle"
            >
              {d}
            </div>
          ))}
          {cells.map((cell) => {
            const inMonth = cell.getMonth() === monthStart.getMonth();
            const isToday = sameDay(cell, today);
            const dayAppts = appointments.filter((a) =>
              sameDay(new Date(a.startAtIso), cell),
            );
            return (
              <button
                key={cell.toISOString()}
                type="button"
                onClick={() => onDayClick(cell)}
                className={cn(
                  "bg-surface text-left p-2 min-h-[88px] flex flex-col gap-1 hover:bg-surface-muted transition-colors",
                  !inMonth && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "text-[12px] tabular-nums",
                    isToday
                      ? "text-accent font-semibold"
                      : "text-text",
                  )}
                >
                  {cell.getDate()}
                </span>
                <div className="flex-1 space-y-0.5 overflow-hidden">
                  {dayAppts.slice(0, 3).map((a) => {
                    const tone = toneFor(a.modality);
                    return (
                      <div
                        key={a.id}
                        className="flex items-center gap-1 truncate text-[10px] text-text"
                      >
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full shrink-0", tone.dot)}
                        />
                        <span className="truncate">
                          {formatTime(a.startAtIso)} {a.patientName}
                        </span>
                      </div>
                    );
                  })}
                  {dayAppts.length > 3 && (
                    <p className="text-[10px] text-text-subtle">
                      +{dayAppts.length - 3} more
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Slot + chip + dialog ────────────────────────────────────────────

function Slot({
  appointment,
  pending,
  hourMark,
  onAppointmentDrop,
  onCreate,
}: {
  appointment: CalendarAppointment | null;
  pending: boolean;
  hourMark: boolean;
  onAppointmentDrop: (apptId: string) => void;
  onCreate: () => void;
}) {
  const [isOver, setIsOver] = React.useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        const apptId = e.dataTransfer.getData("text/appt-id");
        const drag = e.dataTransfer.getData("text/drag-kind");
        if (drag === "create") {
          onCreate();
          return;
        }
        if (apptId) onAppointmentDrop(apptId);
      }}
      onClick={(e) => {
        if (appointment) return;
        if (e.detail >= 1) onCreate();
      }}
      className={cn(
        "border-r border-border/40 cursor-cell",
        hourMark && "border-t border-border/60",
        isOver && "bg-accent-soft/50",
        pending && "opacity-70",
      )}
      style={{ height: SQUARE }}
      role="button"
      aria-label={appointment ? "Move appointment" : "Create appointment"}
    >
      {appointment && <AppointmentChip appt={appointment} />}
    </div>
  );
}

function AppointmentChip({ appt }: { appt: CalendarAppointment }) {
  const start = new Date(appt.startAtIso);
  const end = new Date(appt.endAtIso);
  const slotCount = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (SLOT_MIN * 60_000)),
  );
  const tone = toneFor(appt.modality);
  const apptTip = `${appt.patientName} · ${formatTime(appt.startAtIso)}–${formatTime(appt.endAtIso)} · ${tone.label}`;
  return (
    <Tooltip content={apptTip}>
      <Link
        href={`/clinic/patients/${appt.patientId}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/appt-id", appt.id);
          e.dataTransfer.setData("text/drag-kind", "move");
        }}
        className={cn(
          "block rounded-md px-2 py-1 mx-0.5 my-0.5 text-[11px] truncate cursor-grab active:cursor-grabbing border transition-colors",
          tone.chip,
        )}
        style={{ height: slotCount * SQUARE - 4 }}
      >
        <span className="font-medium truncate">{appt.patientName}</span>
        {appt.providerName && (
          <span className="block text-[9px] truncate opacity-80">
            {appt.providerName}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}

function CreateDialog({
  startIso,
  providers,
  patients,
  defaultProviderId,
  onClose,
  onSubmit,
  pending,
}: {
  startIso: string;
  providers: CalendarProvider[];
  patients: CalendarPatient[];
  defaultProviderId: string | null;
  onClose: () => void;
  onSubmit: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
  pending: boolean;
}) {
  const start = new Date(startIso);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center print:hidden"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <Card className="relative max-w-md w-[92%] z-10">
        <CardContent className="pt-5 space-y-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-text-subtle">
              New appointment
            </p>
            <h3 className="font-display text-lg text-text">
              {start.toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </h3>
          </div>
          <form
            action={async (fd) => {
              await onSubmit(fd);
            }}
            className="space-y-3"
          >
            <Field label="Patient">
              <select
                name="patientId"
                required
                className="h-9 px-2 w-full text-sm rounded-md border border-border-strong bg-surface"
              >
                <option value="">Select patient…</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Provider">
              <select
                name="providerId"
                defaultValue={defaultProviderId ?? ""}
                className="h-9 px-2 w-full text-sm rounded-md border border-border-strong bg-surface"
              >
                <option value="">Unassigned</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Modality">
                <select
                  name="modality"
                  defaultValue="video"
                  className="h-9 px-2 w-full text-sm rounded-md border border-border-strong bg-surface"
                >
                  <option value="video">Video</option>
                  <option value="in_person">In person</option>
                  <option value="phone">Phone</option>
                </select>
              </Field>
              <Field label="Duration (min)">
                <input
                  type="number"
                  name="durationMinutes"
                  min={10}
                  max={180}
                  step={5}
                  defaultValue={30}
                  className="h-9 px-2 w-full text-sm rounded-md border border-border-strong bg-surface"
                />
              </Field>
            </div>
            <Field label="Notes (optional)">
              <textarea
                name="notes"
                rows={2}
                className="px-2 py-1.5 w-full text-sm rounded-md border border-border-strong bg-surface"
              />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Schedule
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfMonth(d: Date): Date {
  const out = new Date(d);
  out.setDate(1);
  out.setHours(0, 0, 0, 0);
  return out;
}

function shiftAnchor(d: Date, view: CalendarView, n: number): Date {
  const out = new Date(d);
  if (view === "day") out.setDate(out.getDate() + n);
  else if (view === "week") out.setDate(out.getDate() + 7 * n);
  else out.setMonth(out.getMonth() + n);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function findAppt(
  list: CalendarAppointment[],
  weekStart: Date,
  dayIdx: number,
  slotIdx: number,
): CalendarAppointment | null {
  const slotStart = new Date(weekStart);
  slotStart.setDate(slotStart.getDate() + dayIdx);
  slotStart.setHours(FIRST_HOUR, slotIdx * SLOT_MIN, 0, 0);
  return (
    list.find((a) => new Date(a.startAtIso).getTime() === slotStart.getTime()) ??
    null
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Re-exported for the optional in-card status badge wherever consumers
// want to render appointment status next to chips.
export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "confirmed"
      ? "accent"
      : status === "completed"
        ? "success"
        : status === "cancelled" || status === "no_show"
          ? "danger"
          : "info";
  return (
    <Badge tone={tone} className="text-[10px]">
      {status}
    </Badge>
  );
}
