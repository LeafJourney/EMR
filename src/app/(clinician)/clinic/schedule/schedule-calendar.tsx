"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { formatModality } from "@/lib/utils/format";
import { Eyebrow } from "@/components/ui/ornament";
import {
  rescheduleAppointmentAction,
  createPatientAppointmentAction,
  createSpecialBlockAction,
} from "./actions";

export type AppointmentDTO = {
  id: string;
  patientId: string;
  patientName: string;
  providerName: string | null;
  startAtIso: string;
  endAtIso: string;
  status: string;
  modality: string;
  notes: string | null;
};

type PatientDTO = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirthIso: string | null;
  email: string | null;
  address?: string | null;
};

type View = "day" | "week" | "list";

type Props = {
  weekStartIso: string;
  appointments: AppointmentDTO[];
  initialView?: View;
  timeZone: string;
  patients: PatientDTO[];
  patientId?: string;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const FIRST_HOUR = 7;
const LAST_HOUR = 19;
const SLOT_MIN = 30;
const SLOTS_PER_HOUR = 60 / SLOT_MIN;
const TOTAL_SLOTS = (LAST_HOUR - FIRST_HOUR) * SLOTS_PER_HOUR;
const SQUARE = 36; // px per slot — keeps cells visually square

export function ScheduleCalendar({
  weekStartIso,
  appointments,
  initialView = "week",
  timeZone,
  patients,
  patientId,
}: Props) {
  const router = useRouter();
  const [view, setView] = React.useState<View>(initialView);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  // Modals & Menu State
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; date: Date } | null>(null);
  const [showBlockModal, setShowBlockModal] = React.useState<Date | null>(null);
  const [showScheduleModal, setShowScheduleModal] = React.useState<Date | null>(null);
  const [pendingConflict, setPendingConflict] = React.useState<{
    appointmentId: string;
    newStartIso: string;
    message: string;
  } | null>(null);

  const weekStart = React.useMemo(() => parseLocalDateOnly(weekStartIso), [weekStartIso]);
  const dayStart = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today >= weekStart && today < addDays(weekStart, 7)) return today;
    return weekStart;
  }, [weekStart]);

  const handleSlotClick = (dayIdx: number, slotIdx: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIdx);
    d.setMinutes(FIRST_HOUR * 60 + slotIdx * SLOT_MIN);
    d.setSeconds(0);
    d.setMilliseconds(0);
    setShowScheduleModal(d);
  };

  // Click handler to dismiss context menu
  React.useEffect(() => {
    const handleGlobalClick = () => {
      setContextMenu(null);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  const onDrop = async (appointmentId: string, dayIdx: number, slotIdx: number, force = false) => {
    setError(null);
    setPendingConflict(null);
    const newStart = new Date(weekStart);
    newStart.setDate(newStart.getDate() + dayIdx);
    newStart.setMinutes(FIRST_HOUR * 60 + slotIdx * SLOT_MIN);
    const startIso = newStart.toISOString();

    setPending(true);
    try {
      const r = await rescheduleAppointmentAction({
        appointmentId,
        newStartIso: startIso,
        force,
      });

      if (!r.ok) {
        if (r.code === "CONFLICT") {
          setPendingConflict({
            appointmentId,
            newStartIso: startIso,
            message: r.error,
          });
        } else {
          setError(r.error);
        }
      } else {
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  const handleForceDrop = async () => {
    if (!pendingConflict) return;
    const { appointmentId, newStartIso } = pendingConflict;
    setPending(true);
    try {
      const r = await rescheduleAppointmentAction({
        appointmentId,
        newStartIso,
        force: true,
      });
      if (!r.ok) setError(r.error);
      else router.refresh();
    } finally {
      setPending(false);
      setPendingConflict(null);
    }
  };

  // EMR-578 — List-view drag: drop an appointment onto a day group to move it
  // to that day at the same time-of-day. Reuses onDrop (conflict handling).
  const onDropToDay = (appointmentId: string, dayKey: string) => {
    const appt = appointments.find((a) => a.id === appointmentId);
    if (!appt) return;
    const cur = new Date(appt.startAtIso);
    const dayIdx = Math.round(
      (new Date(dayKey).getTime() - new Date(weekStart.toDateString()).getTime()) /
        86_400_000,
    );
    const slotIdx = Math.max(
      0,
      Math.round((cur.getHours() * 60 + cur.getMinutes() - FIRST_HOUR * 60) / SLOT_MIN),
    );
    onDrop(appointmentId, dayIdx, slotIdx);
  };

  const goWeek = (delta: number) => {
    const next = addDays(weekStart, delta * 7);
    const iso = next.toISOString().slice(0, 10);
    router.push(`/clinic/schedule?week=${iso}&view=${view}`);
  };

  const handleSlotContextMenu = (e: React.MouseEvent, dayIdx: number, slotIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIdx);
    d.setMinutes(FIRST_HOUR * 60 + slotIdx * SLOT_MIN);
    d.setSeconds(0);
    d.setMilliseconds(0);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      date: d,
    });
  };

  // d is a local calendar date (see parseLocalDateOnly) — format it directly so
  // the header reads "Sunday, Jun 7, 2026" rather than the malformed
  // "Jun 6 – 2026 (…)" the old range-style string produced.
  const formatDayHeader = (d: Date): string =>
    d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatWeekRange = (start: Date): string => {
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    const startFmt = start.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const endFmt = end.toLocaleDateString(undefined, {
      month: sameMonth ? undefined : "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startFmt} – ${endFmt}`;
  };

  return (
    <div className="space-y-4 relative">
      {/* Dynamic Header */}
      <div className="mb-6">
        <Eyebrow className="mb-2">Schedule</Eyebrow>
        <h1 className="font-display text-3xl text-text tracking-tight">
          {view === "day" ? formatDayHeader(dayStart) : formatWeekRange(weekStart)}
        </h1>
        <p className="text-[14px] text-text-muted mt-1.5">
          Right-click empty space to block time or schedule. Drag appointments to reschedule.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-border bg-surface p-1">
          {(["day", "week", "list"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md capitalize transition-colors",
                view === v ? "bg-accent text-accent-ink font-semibold" : "text-text-subtle hover:text-text",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => goWeek(-1)}>
            ← Prev
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push("/clinic/schedule")}>
            Today
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goWeek(1)}>
            Next →
          </Button>
          <Link
            href="/clinic/schedule/month"
            className="text-xs font-medium text-text-subtle hover:text-text underline-offset-4 hover:underline ml-1"
          >
            Month view
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {view === "list" && (
        <ListView appointments={appointments} onDropToDay={onDropToDay} />
      )}
      {view === "week" && (
        <WeekGrid
          weekStart={weekStart}
          appointments={appointments}
          onDrop={onDrop}
          onContextMenu={handleSlotContextMenu}
          onSlotClick={handleSlotClick}
          pending={pending}
        />
      )}
      {view === "day" && (
        <DayGrid
          day={dayStart}
          appointments={appointments.filter((a) =>
            sameDay(new Date(a.startAtIso), dayStart),
          )}
          onDrop={(apptId, slotIdx) => {
            const dayIdx = Math.round(
              (dayStart.getTime() - weekStart.getTime()) / 86_400_000,
            );
            return onDrop(apptId, dayIdx, slotIdx);
          }}
          onContextMenu={(e, slotIdx) => {
            const dayIdx = Math.round(
              (dayStart.getTime() - weekStart.getTime()) / 86_400_000,
            );
            return handleSlotContextMenu(e, dayIdx, slotIdx);
          }}
          onSlotClick={(slotIdx) => {
            const dayIdx = Math.round(
              (dayStart.getTime() - weekStart.getTime()) / 86_400_000,
            );
            return handleSlotClick(dayIdx, slotIdx);
          }}
          pending={pending}
        />
      )}

      {/* Floating Context Menu */}
      {contextMenu && (
        <div
          className="absolute z-40 bg-surface border border-border rounded-xl shadow-xl py-1.5 w-48 text-left"
          style={{ top: contextMenu.y - 120, left: contextMenu.x - 260 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setShowScheduleModal(contextMenu.date);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-text hover:bg-surface-muted transition-colors"
          >
            🗓 Schedule Patient
          </button>
          <button
            onClick={() => {
              setShowBlockModal(contextMenu.date);
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-xs font-semibold text-text hover:bg-surface-muted transition-colors border-t border-border/45"
          >
            ⏱ New Time Block
          </button>
        </div>
      )}

      {/* Collision Conflict Dialog */}
      {pendingConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface p-6 rounded-2xl border border-border shadow-2xl w-[400px]">
            <h2 className="text-lg font-bold text-text mb-2">Double-Book Confirmation</h2>
            <p className="text-sm text-text-subtle mb-6">{pendingConflict.message}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPendingConflict(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleForceDrop}>
                Double Book
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Block Time Modal */}
      {showBlockModal && (
        <BlockModal
          startDate={showBlockModal}
          onClose={() => setShowBlockModal(null)}
          onSave={async (reason, duration, notes) => {
            setShowBlockModal(null);
            setPending(true);
            try {
              const startIso = showBlockModal.toISOString();
              const endIso = new Date(showBlockModal.getTime() + duration * 60000).toISOString();
              const r = await createSpecialBlockAction({
                startIso,
                endIso,
                reason,
                notes,
              });
              if (!r.ok) setError(r.error);
              else router.refresh();
            } finally {
              setPending(false);
            }
          }}
        />
      )}

      {/* Schedule Patient Modal */}
      {showScheduleModal && (
        <ScheduleModal
          startDate={showScheduleModal}
          patients={patients}
          appointments={appointments}
          timeZone={timeZone}
          onClose={() => setShowScheduleModal(null)}
          initialPatient={patients.find((p) => p.id === patientId) || null}
          onSave={async (patientId, duration, modality, notes, force) => {
            setShowScheduleModal(null);
            setPending(true);
            try {
              const startIso = showScheduleModal.toISOString();
              const endIso = new Date(showScheduleModal.getTime() + duration * 60000).toISOString();
              const r = await createPatientAppointmentAction({
                patientId,
                startIso,
                endIso,
                notes,
                modality,
                force,
              });
              if (!r.ok) setError(r.error);
              else router.refresh();
            } finally {
              setPending(false);
            }
          }}
        />
      )}
    </div>
  );
}

// ── Week grid ───────────────────────────────────────────────────

function WeekGrid({
  weekStart,
  appointments,
  onDrop,
  onContextMenu,
  onSlotClick,
  pending,
}: {
  weekStart: Date;
  appointments: AppointmentDTO[];
  onDrop: (apptId: string, dayIdx: number, slotIdx: number) => void;
  onContextMenu: (e: React.MouseEvent, dayIdx: number, slotIdx: number) => void;
  onSlotClick: (dayIdx: number, slotIdx: number) => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 overflow-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: `60px repeat(7, minmax(120px, 1fr))` }}
        >
          {/* Header row */}
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

          {/* Time + slot rows */}
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
                    dayIdx={dayIdx}
                    slotIdx={slotIdx}
                    appointment={findAppt(appointments, weekStart, dayIdx, slotIdx)}
                    onDrop={(apptId) => onDrop(apptId, dayIdx, slotIdx)}
                    onContextMenu={(e) => onContextMenu(e, dayIdx, slotIdx)}
                    onClick={() => onSlotClick(dayIdx, slotIdx)}
                    pending={pending}
                    hourMark={isHourMark}
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

function Slot({
  dayIdx,
  slotIdx,
  appointment,
  onDrop,
  onContextMenu,
  onClick,
  pending,
  hourMark,
}: {
  dayIdx: number;
  slotIdx: number;
  appointment: AppointmentDTO | null;
  onDrop: (apptId: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onClick: () => void;
  pending: boolean;
  hourMark: boolean;
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
        if (apptId) onDrop(apptId);
      }}
      onContextMenu={onContextMenu}
      onClick={() => {
        if (!appointment) {
          onClick();
        }
      }}
      className={cn(
        "border-r border-border/40 hover:bg-surface-muted transition-colors",
        appointment ? "cursor-context-menu" : "cursor-pointer",
        hourMark && "border-t border-border/60",
        isOver && "bg-accent-soft/50",
        pending && "opacity-70",
      )}
      style={{ height: SQUARE }}
    >
      {appointment && <AppointmentChip appt={appointment} />}
    </div>
  );
}

// ── Day grid ────────────────────────────────────────────────────

function DayGrid({
  day,
  appointments,
  onDrop,
  onContextMenu,
  onSlotClick,
  pending,
}: {
  day: Date;
  appointments: AppointmentDTO[];
  onDrop: (apptId: string, slotIdx: number) => void;
  onContextMenu: (e: React.MouseEvent, slotIdx: number) => void;
  onSlotClick: (slotIdx: number) => void;
  pending: boolean;
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
            const inSlot = appointments.find(
              (a) =>
                new Date(a.startAtIso).getTime() === slotStart.getTime(),
            );
            return (
              <React.Fragment key={slotIdx}>
                <div
                  className="text-[10px] tabular-nums text-text-subtle pr-2 text-right"
                  style={{ height: SQUARE }}
                >
                  {isHourMark ? `${hour}:00` : ""}
                </div>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const apptId = e.dataTransfer.getData("text/appt-id");
                    if (apptId) onDrop(apptId, slotIdx);
                  }}
                  onContextMenu={(e) => onContextMenu(e, slotIdx)}
                  onClick={() => {
                    if (!inSlot) {
                      onSlotClick(slotIdx);
                    }
                  }}
                  className={cn(
                    "border-l border-border/40 hover:bg-surface-muted transition-colors",
                    inSlot ? "cursor-context-menu" : "cursor-pointer",
                    isHourMark && "border-t border-border/60",
                    pending && "opacity-70",
                  )}
                  style={{ height: SQUARE }}
                >
                  {inSlot && <AppointmentChip appt={inSlot} />}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── List view ───────────────────────────────────────────────────

function ListView({
  appointments,
  onDropToDay,
}: {
  appointments: AppointmentDTO[];
  // EMR-578 — drop an appointment onto a day group to reschedule it there.
  onDropToDay?: (appointmentId: string, dayKey: string) => void;
}) {
  const [dragOverDay, setDragOverDay] = React.useState<string | null>(null);

  if (appointments.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 pb-6 text-center text-text-muted">
          No appointments scheduled this week.
        </CardContent>
      </Card>
    );
  }
  const groups = new Map<string, AppointmentDTO[]>();
  for (const a of appointments) {
    const key = new Date(a.startAtIso).toDateString();
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([dayKey, list]) => (
        <Card
          key={dayKey}
          className={cn(
            "transition-colors",
            dragOverDay === dayKey && "ring-2 ring-accent/50 border-accent/40",
          )}
          onDragOver={(e) => {
            if (!onDropToDay) return;
            e.preventDefault();
            setDragOverDay(dayKey);
          }}
          onDragLeave={() => setDragOverDay((d) => (d === dayKey ? null : d))}
          onDrop={(e) => {
            if (!onDropToDay) return;
            e.preventDefault();
            setDragOverDay(null);
            const apptId = e.dataTransfer.getData("text/appt-id");
            if (apptId) onDropToDay(apptId, dayKey);
          }}
        >
          <CardContent className="pt-4">
            <p className="text-[11px] uppercase tracking-wider text-text-subtle font-medium mb-3">
              {dayKey}
            </p>
            <ul className="divide-y divide-border/60">
              {list.map((a) => {
                const isBlock = a.patientName.includes("System CalendarBlock");
                return (
                  <li
                    key={a.id}
                    draggable={!isBlock && !!onDropToDay}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/appt-id", a.id)
                    }
                    className={cn(
                      "py-2 flex items-center gap-3",
                      !isBlock && onDropToDay && "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    <span className="text-xs font-mono tabular-nums text-text-subtle w-16 shrink-0">
                      {formatTime(a.startAtIso)}
                    </span>
                    {isBlock ? (
                      <span className="flex-1 text-sm font-semibold text-text-subtle">
                        {a.notes?.replace(/\[CalendarBlock:.*?\]/, "").trim() || "Blocked Time"}
                      </span>
                    ) : (
                      <Link
                        href={`/clinic/patients/${a.patientId}`}
                        className="flex-1 min-w-0 text-sm text-text hover:text-accent truncate"
                      >
                        {a.patientName}
                      </Link>
                    )}
                    <Badge tone={statusTone(a.status)} className="text-[10px]">
                      {a.status}
                    </Badge>
                    <span className="text-[11px] text-text-subtle">{formatModality(a.modality)}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Chip + helpers ──────────────────────────────────────────────

function AppointmentChip({ appt }: { appt: AppointmentDTO }) {
  const start = new Date(appt.startAtIso);
  const end = new Date(appt.endAtIso);
  const slotCount = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / (SLOT_MIN * 60_000)),
  );

  const isBlock = appt.patientName.includes("System CalendarBlock");

  if (isBlock) {
    let blockType = "Block";
    let colorClass = "bg-neutral-100 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200";
    if (appt.notes?.includes("CalendarBlock:MEETING")) {
      blockType = "Meeting";
      colorClass = "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300";
    } else if (appt.notes?.includes("CalendarBlock:VACATION")) {
      blockType = "Vacation";
      colorClass = "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-300";
    } else if (appt.notes?.includes("CalendarBlock:DO_NOT_BOOK")) {
      blockType = "Do Not Book";
      colorClass = "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-300";
    }

    return (
      <div
        className={cn(
          "block rounded-lg px-2.5 py-1.5 mx-0.5 my-0.5 text-[11px] truncate border select-none shadow-sm",
          colorClass
        )}
        style={{ height: slotCount * SQUARE - 4 }}
        title={`${blockType} · ${formatTime(appt.startAtIso)}–${formatTime(appt.endAtIso)}`}
      >
        <div className="font-bold uppercase tracking-wider text-[9px] opacity-75">{blockType}</div>
        <div className="truncate text-xs font-semibold mt-0.5">
          {appt.notes?.replace(/\[CalendarBlock:.*?\]/, "").trim() || "Blocked Time"}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/clinic/patients/${appt.patientId}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/appt-id", appt.id)}
      className={cn(
        "block rounded-lg px-2.5 py-1.5 mx-0.5 my-0.5 text-[11px] truncate cursor-grab active:cursor-grabbing",
        "bg-accent-soft border border-accent/20 text-accent hover:bg-accent/15 transition-all shadow-sm",
      )}
      style={{ height: slotCount * SQUARE - 4 }}
      title={`${appt.patientName} · ${formatTime(appt.startAtIso)}–${formatTime(appt.endAtIso)} · ${appt.status}`}
    >
      <span className="font-semibold truncate">{appt.patientName}</span>
      <div className="text-[9px] opacity-80 mt-0.5">{formatTime(appt.startAtIso)}</div>
    </Link>
  );
}

// ── Modal components ──────────────────────────────────────────────

function BlockModal({
  startDate,
  onClose,
  onSave,
}: {
  startDate: Date;
  onClose: () => void;
  onSave: (reason: "meeting" | "vacation" | "do_not_book", duration: number, notes: string) => void;
}) {
  const [reason, setReason] = React.useState<"meeting" | "vacation" | "do_not_book">("meeting");
  const [duration, setDuration] = React.useState<number>(30);
  const [notes, setNotes] = React.useState<string>("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface p-6 rounded-2xl border border-border shadow-2xl w-full max-w-md">
        <h2 className="text-lg font-bold text-text mb-1">Block Time</h2>
        <p className="text-xs text-text-subtle mb-4">
          Reserve calendar capacity on {startDate.toLocaleDateString()} at {formatTime(startDate.toISOString())}.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-subtle mb-1.5">Block Type</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as any)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="meeting">Meeting</option>
              <option value="vacation">Vacation / OOO</option>
              <option value="do_not_book">Do Not Book</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-subtle mb-1.5">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10))}
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value={15}>15 Minutes</option>
              <option value={30}>30 Minutes</option>
              <option value={45}>45 Minutes</option>
              <option value={60}>1 Hour</option>
              <option value={120}>2 Hours</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-subtle mb-1.5">Description / Note</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Clinical review, staff meeting, out of office..."
              rows={3}
              className="w-full p-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onSave(reason, duration, notes)}>
            Save Block
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScheduleModal({
  startDate,
  patients,
  appointments,
  timeZone,
  onClose,
  onSave,
}: {
  startDate: Date;
  patients: PatientDTO[];
  appointments: AppointmentDTO[];
  timeZone: string;
  onClose: () => void;
  onSave: (patientId: string, duration: number, modality: string, notes: string, force: boolean) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [selectedPatient, setSelectedPatient] = React.useState<PatientDTO | null>(null);
  const [duration, setDuration] = React.useState<number>(30);
  const [modality, setModality] = React.useState<string>("in_person");
  const [notes, setNotes] = React.useState<string>("");
  const [force, setForce] = React.useState<boolean>(false);

  // Filter patients by search query
  const filteredPatients = React.useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return patients.filter((p) => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      const phone = p.phone?.toLowerCase() || "";
      const email = p.email?.toLowerCase() || "";
      return name.includes(q) || phone.includes(q) || email.includes(q);
    });
  }, [search, patients]);

  // Check duplicate booking in same week
  const duplicateWarning = React.useMemo(() => {
    if (!selectedPatient) return false;
    
    const getSundayStr = (d: Date) => {
      const out = new Date(d);
      out.setHours(0, 0, 0, 0);
      out.setDate(out.getDate() - out.getDay());
      return out.toDateString();
    };

    const weekStartStr = getSundayStr(startDate);

    return appointments.some((a) => {
      if (a.patientId !== selectedPatient.id) return false;
      const apptDate = new Date(a.startAtIso);
      return getSundayStr(apptDate) === weekStartStr;
    });
  }, [selectedPatient, startDate, appointments]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface p-6 rounded-2xl border border-border shadow-2xl w-full max-w-md">
        <h2 className="text-lg font-bold text-text mb-1">Schedule Patient Visit</h2>
        <p className="text-xs text-text-subtle mb-4">
          Book appointment on {startDate.toLocaleDateString()} at {formatTime(startDate.toISOString())}.
        </p>

        <div className="space-y-4">
          <div className="relative">
            <label className="block text-xs font-bold uppercase tracking-wider text-text-subtle mb-1.5">Search Patient</label>
            {selectedPatient ? (
              <div className="flex items-center justify-between border border-accent/20 bg-accent-soft/30 p-2.5 rounded-lg">
                <div>
                  <div className="text-sm font-semibold text-text">
                    {selectedPatient.firstName} {selectedPatient.lastName}
                  </div>
                  {selectedPatient.phone && (
                    <div className="text-[11px] text-text-subtle">
                      Phone: {selectedPatient.phone}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  className="text-xs text-accent hover:text-accent-hover font-semibold"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Type name, phone number, or email..."
                  className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
                  autoFocus
                />
                {filteredPatients.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    {filteredPatients.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatient(p);
                          setSearch("");
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors border-b border-border/30 last:border-b-0"
                      >
                        <div className="font-bold text-sm text-text">
                          {p.firstName} {p.lastName}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[11px] text-text-subtle">
                          <div>
                            <span className="font-semibold">DOB:</span>{" "}
                            {p.dateOfBirthIso
                              ? new Date(p.dateOfBirthIso).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  timeZone: "UTC",
                                })
                              : "N/A"}
                          </div>
                          <div>
                            <span className="font-semibold">Age:</span>{" "}
                            {computeAge(p.dateOfBirthIso) ?? "N/A"}
                          </div>
                          <div className="col-span-2">
                            <span className="font-semibold">Phone:</span> {p.phone || "N/A"}
                          </div>
                          <div className="col-span-2 truncate">
                            <span className="font-semibold">Address:</span> {p.address || "N/A"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {duplicateWarning && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <span className="font-bold">⚠️ Weekly Booking Warning:</span> This patient is already scheduled for another visit during this week.
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="force-checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="rounded border-border focus:ring-accent"
                />
                <label htmlFor="force-checkbox" className="font-semibold select-none cursor-pointer">
                  Ignore warning and double-book
                </label>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-subtle mb-1.5">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10))}
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value={15}>15 Minutes</option>
              <option value={30}>30 Minutes</option>
              <option value={45}>45 Minutes</option>
              <option value={60}>1 Hour</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-subtle mb-1.5">Modality</label>
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="in_person">In-Person Visit</option>
              <option value="video">Video Session</option>
              <option value="phone">Phone Consultation</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-subtle mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for visit, symptoms, prep actions..."
              rows={2}
              className="w-full p-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!selectedPatient || (duplicateWarning && !force)}
            onClick={() => onSave(selectedPatient!.id, duration, modality, notes, force)}
          >
            Schedule Visit
          </Button>
        </div>
      </div>
    </div>
  );
}

function findAppt(
  list: AppointmentDTO[],
  weekStart: Date,
  dayIdx: number,
  slotIdx: number,
): AppointmentDTO | null {
  const slotStart = new Date(weekStart);
  slotStart.setDate(slotStart.getDate() + dayIdx);
  slotStart.setHours(FIRST_HOUR, slotIdx * SLOT_MIN, 0, 0);
  return (
    list.find((a) => new Date(a.startAtIso).getTime() === slotStart.getTime()) ??
    null
  );
}

// weekStartIso is a UTC ISO string but represents a *calendar date* (the week's
// Sunday). `new Date(iso)` reads it as UTC midnight, which in a negative-offset
// browser renders one day earlier — shifting every column's date number back a
// day (the "SUNDAY 6 / MONDAY 7" mislabel). Parse the date part as LOCAL
// midnight so day numbers, labels, and appointment placement all agree.
function parseLocalDateOnly(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" | "accent" {
  switch (status) {
    case "completed":
      return "success";
    case "cancelled":
    case "no_show":
      return "danger";
    case "confirmed":
      return "accent";
    case "scheduled":
      return "info";
    default:
      return "neutral";
  }
}

function computeAge(dobIso: string | null): number | null {
  if (!dobIso) return null;
  const birth = new Date(dobIso);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
