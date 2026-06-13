"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SectionSearchBar,
  applySectionQuery,
  type SectionQuery,
} from "@/components/ops/master";
import { cn } from "@/lib/utils/cn";

interface ClockEntry {
  id: string;
  type: "in" | "out";
  timestamp: string; // ISO
}

const STORAGE_KEY = "leafjourney:time-clock:entries";
const CLOCKED_IN_KEY = "leafjourney:time-clock:clocked-in-at";

function loadEntries(): ClockEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ClockEntry[]) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: ClockEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m ${sec.toString().padStart(2, "0")}s`;
}

function formatHours(ms: number): string {
  const hours = ms / 3_600_000;
  return hours.toFixed(2);
}

function startOfDay(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function startOfWeek(d: Date) {
  const out = startOfDay(d);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function computeWorkedMs(entries: ClockEntry[], since: Date, until: Date = new Date()): number {
  // Pair chronologically: in → out, trimmed to [since, until]
  const sorted = [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  let total = 0;
  let clockInAt: Date | null = null;
  for (const e of sorted) {
    const t = new Date(e.timestamp);
    if (e.type === "in") {
      clockInAt = t;
    } else if (clockInAt) {
      const start = clockInAt > since ? clockInAt : since;
      const end = t < until ? t : until;
      if (end > start) total += end.getTime() - start.getTime();
      clockInAt = null;
    }
  }
  // Active shift not yet clocked out
  if (clockInAt) {
    const start = clockInAt > since ? clockInAt : since;
    const end = until;
    if (end > start) total += end.getTime() - start.getTime();
  }
  return total;
}

export function TimeclockView({ userName }: { userName: string }) {
  const [entries, setEntries] = useState<ClockEntry[]>([]);
  const [clockedInAt, setClockedInAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage
  useEffect(() => {
    setEntries(loadEntries());
    const raw = window.localStorage.getItem(CLOCKED_IN_KEY);
    if (raw) setClockedInAt(new Date(raw));
    setHydrated(true);
  }, []);

  // Live ticker
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleClockIn = useCallback(() => {
    const ts = new Date();
    const next: ClockEntry = { id: `e-${ts.getTime()}`, type: "in", timestamp: ts.toISOString() };
    const updated = [...entries, next];
    setEntries(updated);
    saveEntries(updated);
    setClockedInAt(ts);
    window.localStorage.setItem(CLOCKED_IN_KEY, ts.toISOString());
  }, [entries]);

  const handleClockOut = useCallback(() => {
    const ts = new Date();
    const next: ClockEntry = { id: `e-${ts.getTime()}`, type: "out", timestamp: ts.toISOString() };
    const updated = [...entries, next];
    setEntries(updated);
    saveEntries(updated);
    setClockedInAt(null);
    window.localStorage.removeItem(CLOCKED_IN_KEY);
  }, [entries]);

  const currentShiftMs = clockedInAt ? now.getTime() - clockedInAt.getTime() : 0;

  const todayMs = useMemo(
    () => computeWorkedMs(entries, startOfDay(now), now),
    [entries, now],
  );

  const weekMs = useMemo(
    () => computeWorkedMs(entries, startOfWeek(now), now),
    [entries, now],
  );

  // MASTER-prompt G8 — calendar/keyword search over the recent-activity log.
  const [activityQuery, setActivityQuery] = useState<SectionQuery | null>(null);
  const filteredEntries = useMemo(
    () =>
      activityQuery
        ? applySectionQuery(entries, activityQuery, {
            getDate: (e) => e.timestamp,
            getText: (e) => `clock ${e.type} clocked ${e.type}`,
          })
        : entries,
    [entries, activityQuery],
  );
  const recent = [...filteredEntries].reverse().slice(0, 10);

  function exportTimesheet() {
    const header = "timestamp,type\n";
    const rows = entries
      .slice()
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((e) => `${e.timestamp},${e.type}`)
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timesheet-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <Card tone="raised">
        <CardContent className="py-10 text-center">
          <p className="text-xs uppercase tracking-[0.18em] text-text-subtle mb-2">
            {userName}
          </p>
          <div className="mb-6">
            {clockedInAt ? (
              <Badge tone="success" className="text-xs">On shift since {clockedInAt.toLocaleTimeString()}</Badge>
            ) : (
              <Badge tone="neutral" className="text-xs">Not on shift</Badge>
            )}
          </div>
          <div className="font-display text-5xl md:text-6xl tabular-nums text-text mb-6">
            {hydrated ? formatDuration(currentShiftMs) : "—"}
          </div>
          {clockedInAt ? (
            <Button size="lg" variant="danger" onClick={handleClockOut}>
              Clock out
            </Button>
          ) : (
            <Button size="lg" onClick={handleClockIn}>
              Clock in
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wider text-text-subtle">Today</p>
            <p className="font-display text-3xl tabular-nums text-text mt-1">
              {hydrated ? formatHours(todayMs) : "0.00"}h
            </p>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-xs uppercase tracking-wider text-text-subtle">This week</p>
            <p className="font-display text-3xl tabular-nums text-text mt-1">
              {hydrated ? formatHours(weekMs) : "0.00"}h
            </p>
          </CardContent>
        </Card>
      </div>

      <Card tone="raised">
        <CardContent className="py-5">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
            <p className="text-sm font-medium text-text">Recent activity</p>
            <div className="flex items-end gap-2">
              <SectionSearchBar
                onChange={setActivityQuery}
                placeholder="Search — “last 7 days”, “clock out”…"
                aria-label="Search clock activity by date or type"
              />
              <Button size="sm" variant="secondary" onClick={exportTimesheet} disabled={entries.length === 0}>
                Export timesheet
              </Button>
            </div>
          </div>
          {recent.length === 0 ? (
            <p className="text-xs text-text-subtle">No clock activity yet.</p>
          ) : (
            <ul className="divide-y divide-border/70 text-sm">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2">
                  <span className="text-text">
                    Clock {e.type}
                  </span>
                  <span className={cn("text-xs tabular-nums", e.type === "in" ? "text-accent" : "text-text-muted")}>
                    {new Date(e.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
