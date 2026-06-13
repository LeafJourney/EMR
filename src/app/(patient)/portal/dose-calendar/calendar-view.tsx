"use client";

import { useState, useMemo, useCallback } from "react";
import {
  buildMonthEntries,
  getAdherenceLevel,
  ADHERENCE_COLORS,
  type DoseCalendarEntry,
  type DoseLogLite,
} from "@/lib/domain/dose-calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({
  logs,
  scheduledPerDay,
  regimenName,
}: {
  logs: DoseLogLite[];
  scheduledPerDay: number;
  regimenName: string;
}) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const entries = useMemo(
    () => buildMonthEntries(logs, scheduledPerDay, regimenName, year, month),
    [logs, scheduledPerDay, regimenName, year, month],
  );

  const entryMap = useMemo(() => {
    const map = new Map<string, DoseCalendarEntry>();
    for (const e of entries) map.set(e.date, e);
    return map;
  }, [entries]);

  const selectedEntry = selectedDate ? entryMap.get(selectedDate) ?? null : null;

  // Month navigation
  const goToPrev = useCallback(() => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
    setSelectedDate(null);
  }, [month]);

  const goToNext = useCallback(() => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
    setSelectedDate(null);
  }, [month]);

  // Calendar grid
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = new Date(year, month).toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  // Monthly adherence
  const adherencePercent = useMemo(() => {
    if (entries.length === 0) return 0;
    const total = entries.reduce((sum, e) => sum + e.scheduledDoses, 0);
    const taken = entries.reduce((sum, e) => sum + e.takenDoses, 0);
    return total > 0 ? Math.round((taken / total) * 100) : 0;
  }, [entries]);

  const totalTaken = useMemo(
    () => entries.reduce((sum, e) => sum + e.takenDoses, 0),
    [entries],
  );

  const isFutureDay = useCallback(
    (day: number) => {
      const date = new Date(year, month, day);
      return date > today;
    },
    [year, month, today],
  );

  const getDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Regimen name */}
      <Card tone="ambient">
        <CardContent className="py-4 px-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-subtle">
              {scheduledPerDay > 0 ? "Current regimen" : "Tracking"}
            </p>
            <p className="text-sm font-medium text-text mt-0.5">
              {scheduledPerDay > 0 ? regimenName : "Your logged doses"}
            </p>
          </div>
          {scheduledPerDay > 0 && (
            <Badge tone="accent">{scheduledPerDay}x daily</Badge>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>{monthLabel}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={goToPrev}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Button>
              <Button variant="ghost" size="sm" onClick={goToNext}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS_OF_WEEK.map((d) => (
                <div
                  key={d}
                  className="text-center text-[11px] font-medium uppercase tracking-wider text-text-subtle py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {/* Empty cells for days before start of month */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="h-14" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = getDateStr(day);
                const entry = entryMap.get(dateStr);
                const future = isFutureDay(day);
                const isSelected = selectedDate === dateStr;
                const isToday =
                  day === today.getDate() &&
                  month === today.getMonth() &&
                  year === today.getFullYear();

                let dotClass = "bg-gray-200 border border-gray-300";
                if (entry) {
                  const level = getAdherenceLevel(entry.adherencePercent);
                  dotClass = ADHERENCE_COLORS[level].bg;
                } else if (future) {
                  dotClass = "bg-transparent border-2 border-gray-300";
                }

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => entry && setSelectedDate(dateStr)}
                    disabled={!entry}
                    className={cn(
                      "h-14 flex flex-col items-center justify-center gap-1 rounded-lg transition-colors",
                      isSelected && "bg-accent/10 ring-1 ring-accent",
                      !isSelected && entry && "hover:bg-surface-muted",
                      !entry && "cursor-default",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        isToday
                          ? "font-bold text-accent"
                          : future
                            ? "text-text-subtle"
                            : "text-text-muted",
                      )}
                    >
                      {day}
                    </span>
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotClass)} />
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mt-6 pt-4 border-t border-border/60">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
                Legend
              </span>
              {(
                [
                  { label: "Perfect", level: "perfect" },
                  { label: "Good", level: "good" },
                  { label: "Partial", level: "partial" },
                  { label: "Missed", level: "missed" },
                ] as const
              ).map(({ label, level }) => (
                <span key={level} className="flex items-center gap-1.5 text-xs text-text-muted">
                  <span className={cn("h-2.5 w-2.5 rounded-full", ADHERENCE_COLORS[level].bg)} />
                  {label}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <span className="h-2.5 w-2.5 rounded-full bg-transparent border-2 border-gray-300" />
                Future
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Right panel: detail or monthly summary */}
        <div className="space-y-6">
          {/* Monthly summary — real adherence when scheduled, else a logged count */}
          <Card>
            <CardContent className="py-6 flex flex-col items-center">
              {scheduledPerDay > 0 ? (
                <>
                  <div className="relative h-28 w-28 mb-4">
                    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-surface-muted"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${(adherencePercent / 100) * 264} 264`}
                        className="text-emerald-600 transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="font-display text-2xl text-text tabular-nums">
                        {adherencePercent}%
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-text-muted text-center leading-relaxed">
                    You took{" "}
                    <span className="font-medium text-text">{adherencePercent}%</span> of your
                    scheduled doses this month
                  </p>
                </>
              ) : (
                <>
                  <span className="font-display text-4xl text-text tabular-nums mb-1">
                    {totalTaken}
                  </span>
                  <p className="text-sm text-text-muted text-center leading-relaxed">
                    {totalTaken === 0
                      ? "No doses logged this month yet."
                      : `dose${totalTaken === 1 ? "" : "s"} logged this month`}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Day detail panel */}
          {selectedEntry ? (
            <Card tone="raised" className="animate-in slide-in-from-right-4">
              <CardHeader>
                <CardTitle className="text-base">
                  {new Date(selectedEntry.date + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </CardTitle>
                <p className="text-xs text-text-muted mt-1">
                  {selectedEntry.takenDoses}/{selectedEntry.scheduledDoses} doses taken
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {selectedEntry.doses.map((dose, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between py-2 border-b border-border/40 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium",
                            dose.taken
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-50 text-red-600",
                          )}
                        >
                          {dose.taken ? (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          )}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-text">{dose.time}</p>
                          <p className="text-xs text-text-muted">
                            {dose.taken ? "Taken" : "Missed"}
                          </p>
                        </div>
                      </div>
                      {dose.amount && (
                        <span className="text-xs text-text-subtle tabular-nums">
                          {dose.amount} {dose.unit}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <Card tone="outlined">
              <CardContent className="py-8 text-center">
                <p className="text-sm text-text-muted">
                  Click a day on the calendar to see dose details
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
