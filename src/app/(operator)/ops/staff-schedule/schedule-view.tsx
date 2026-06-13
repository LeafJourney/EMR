"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldGroup, Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

export type StaffRole = "provider" | "nurse" | "reception" | "billing";

export interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
}

interface Shift {
  id: string;
  staffId: string;
  // day index 0-6 within the displayed week (Sunday=0)
  dayIdx: number;
  startHour: number; // 8..19
  endHour: number;   // startHour+1..20
}

const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8..19
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const ROLE_LABELS: Record<StaffRole, string> = {
  provider: "Provider",
  nurse: "Nurse",
  reception: "Reception",
  billing: "Billing",
};

const ROLE_TONES: Record<StaffRole, "accent" | "info" | "warning" | "highlight"> = {
  provider: "accent",
  nurse: "info",
  reception: "warning",
  billing: "highlight",
};

// Distinct, stable per-employee colors for shift blocks. Localized to this
// page (inline styles) so the global theme tokens are untouched. The block
// background is a soft tint and the dot/text uses the saturated ink so the
// green shift blocks stay legible both on-screen and in print.
const EMPLOYEE_COLORS: { soft: string; ink: string }[] = [
  { soft: "#D8F0DE", ink: "#157347" }, // green
  { soft: "#DCE8FB", ink: "#1D4ED8" }, // blue
  { soft: "#F3E0F7", ink: "#9333EA" }, // purple
  { soft: "#FCE4D6", ink: "#C2410C" }, // orange
  { soft: "#FFF1C2", ink: "#A16207" }, // amber
  { soft: "#D7F1EE", ink: "#0F766E" }, // teal
  { soft: "#FBD9E3", ink: "#BE185D" }, // pink
  { soft: "#E2E8D5", ink: "#4D7C0F" }, // olive
];

function employeeColor(staff: StaffMember[], staffId: string) {
  const idx = staff.findIndex((s) => s.id === staffId);
  return EMPLOYEE_COLORS[(idx < 0 ? 0 : idx) % EMPLOYEE_COLORS.length];
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function hourLabel(h: number) {
  const suffix = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${suffix}`;
}

export function ScheduleView({ staff }: { staff: StaffMember[] }) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [roleFilter, setRoleFilter] = useState<"all" | StaffRole>("all");
  const [shifts, setShifts] = useState<Shift[]>(() => seedShifts(staff));
  const [editing, setEditing] = useState<{ dayIdx: number; hour: number } | null>(null);
  const [draft, setDraft] = useState<{ staffId: string; startHour: number; endHour: number }>(
    { staffId: staff[0]?.id ?? "", startHour: 9, endHour: 17 },
  );

  const visibleStaff = useMemo(
    () => staff.filter((s) => roleFilter === "all" || s.role === roleFilter),
    [staff, roleFilter],
  );

  const weekDates = useMemo(
    () => DAYS.map((_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const shiftsByCell = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const sh of shifts) {
      for (let h = sh.startHour; h < sh.endHour; h++) {
        const key = `${sh.staffId}:${sh.dayIdx}:${h}`;
        const list = map.get(key) ?? [];
        list.push(sh);
        map.set(key, list);
      }
    }
    return map;
  }, [shifts]);

  function openEditor(dayIdx: number, hour: number) {
    setEditing({ dayIdx, hour });
    setDraft({
      staffId: visibleStaff[0]?.id ?? staff[0]?.id ?? "",
      startHour: hour,
      endHour: Math.min(hour + 4, 20),
    });
  }

  function saveShift() {
    if (!editing) return;
    if (draft.endHour <= draft.startHour) return;
    const shift: Shift = {
      id: `sh-${Date.now()}`,
      staffId: draft.staffId,
      dayIdx: editing.dayIdx,
      startHour: draft.startHour,
      endHour: draft.endHour,
    };
    setShifts((prev) => [...prev, shift]);
    setEditing(null);
  }

  function removeShift(id: string) {
    setShifts((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-5">
      {/*
        Page-scoped print fix. The global print stylesheet (src/app/globals.css)
        hides every <button> with `display: none !important` and strips
        background colors for ink economy. The scheduled shift blocks on this
        page ARE buttons with inline background colors, so without this override
        the printout renders a blank grid. We re-show the shift-block buttons
        (only the ones flagged with data-shift-block) and force their colored
        background + the column headers to print.
      */}
      <style>{`
        @media print {
          /* Re-show the scheduled (colored) shift blocks the global rule hides. */
          .staff-schedule-print button[data-shift-block] {
            display: flex !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Keep the empty hour cells from cluttering the printout. */
          .staff-schedule-print button.shift-cell:not([data-shift-block]) {
            visibility: hidden !important;
          }
          /* Ensure the grid + header keep their structure on paper. */
          .staff-schedule-print table,
          .staff-schedule-print th,
          .staff-schedule-print td {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            ← Previous
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Next →
          </Button>
          <span className="ml-3 text-sm text-text-muted">
            Week of {fmtDate(weekStart)}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", "provider", "nurse", "reception", "billing"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setRoleFilter(key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                roleFilter === key
                  ? "bg-emerald-700 text-white border-emerald-700"
                  : "bg-surface text-text-muted border-border hover:bg-surface-muted",
              )}
            >
              {key === "all" ? "All roles" : ROLE_LABELS[key]}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      <Card tone="raised" className="staff-schedule-print">
        <CardContent className="p-0 overflow-x-auto">
          <table className="min-w-[1000px] w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-surface px-3 py-3 text-left text-base font-semibold text-text w-40">
                  Staff
                </th>
                {weekDates.map((d, i) => (
                  <th key={i} className="px-2 py-3 text-base font-semibold text-text">
                    <div>{DAYS[i]}</div>
                    <div className="text-sm text-text-subtle font-normal">{fmtDate(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStaff.map((s) => (
                <tr key={s.id} className="border-b border-border/60">
                  <td className="sticky left-0 bg-surface px-3 py-2">
                    <div className="font-medium text-text">
                      {s.firstName} {s.lastName}
                    </div>
                    <Badge tone={ROLE_TONES[s.role]} className="mt-1">
                      {ROLE_LABELS[s.role]}
                    </Badge>
                  </td>
                  {weekDates.map((_, dayIdx) => (
                    <td key={dayIdx} className="align-top p-1">
                      <div className="flex flex-col gap-0.5">
                        {HOURS.map((h) => {
                          const key = `${s.id}:${dayIdx}:${h}`;
                          const cellShifts = shiftsByCell.get(key) ?? [];
                          const primary = cellShifts[0];
                          const color = primary ? employeeColor(staff, s.id) : null;
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() => openEditor(dayIdx, h)}
                              data-shift-block={primary ? "true" : undefined}
                              className={cn(
                                "shift-cell h-5 rounded text-[9px] flex items-center justify-center transition-colors",
                                primary
                                  ? "hover:brightness-105"
                                  : "bg-surface-muted/60 text-text-subtle hover:bg-accent-soft/60",
                              )}
                              style={
                                color
                                  ? { backgroundColor: color.soft, color: color.ink }
                                  : undefined
                              }
                              title={`${hourLabel(h)} – ${hourLabel(h + 1)}`}
                            >
                              {primary ? "●" : hourLabel(h)}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardContent className="py-4">
          <p className="text-sm font-medium text-text mb-3">All shifts this week</p>
          {shifts.length === 0 ? (
            <p className="text-xs text-text-subtle">No shifts yet. Click a cell above to add one.</p>
          ) : (
            <ul className="divide-y divide-border/70 text-sm">
              {shifts.map((sh) => {
                const person = staff.find((s) => s.id === sh.staffId);
                return (
                  <li key={sh.id} className="flex items-center justify-between py-2">
                    <div>
                      <span className="font-medium text-text">
                        {person ? `${person.firstName} ${person.lastName}` : "Unknown"}
                      </span>
                      <span className="text-text-muted ml-2">
                        {DAYS[sh.dayIdx]} · {hourLabel(sh.startHour)} – {hourLabel(sh.endHour)}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeShift(sh.id)}>
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setEditing(null)}
        >
          <Card tone="raised" className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-subtle">Add shift</p>
                <h3 className="font-display text-lg text-text mt-1">
                  {DAYS[editing.dayIdx]} · starting {hourLabel(editing.hour)}
                </h3>
              </div>
              <FieldGroup label="Staff">
                <select
                  value={draft.staffId}
                  onChange={(e) => setDraft({ ...draft, staffId: e.target.value })}
                  className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text"
                >
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} — {ROLE_LABELS[s.role]}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Start">
                  <select
                    value={draft.startHour}
                    onChange={(e) => setDraft({ ...draft, startHour: Number(e.target.value) })}
                    className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
                <FieldGroup label="End">
                  <select
                    value={draft.endHour}
                    onChange={(e) => setDraft({ ...draft, endHour: Number(e.target.value) })}
                    className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text"
                  >
                    {[...HOURS.slice(1), 20].map((h) => (
                      <option key={h} value={h}>
                        {hourLabel(h)}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveShift} disabled={!draft.staffId}>
                  Save shift
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function seedShifts(staff: StaffMember[]): Shift[] {
  // Demo: fill Monday–Friday 9-5 for each staff member
  const out: Shift[] = [];
  staff.forEach((s, idx) => {
    for (let d = 1; d <= 5; d++) {
      out.push({
        id: `seed-${s.id}-${d}`,
        staffId: s.id,
        dayIdx: d,
        startHour: 9 + (idx % 2), // small stagger
        endHour: 17 + (idx % 2),
      });
    }
  });
  return out;
}
