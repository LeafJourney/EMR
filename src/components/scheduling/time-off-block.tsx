// SAFE: dead-export-allowed reason="Wave 10 scheduling scaffold (EMR-079); mounted on the scheduling workspace in a later wave"
"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

export type TimeOffReason = "vacation" | "conference" | "sick" | "personal" | "cme" | "other";

export interface TimeOffBlock {
  providerId: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  reason: TimeOffReason;
  notes?: string;
}

export interface TimeOffBlockProps {
  providerId: string;
  providerName?: string;
  /** Number of appointments that fall in the proposed window. Shown to
   *  the user as a warning when > 0; the scheduler reconciles them. */
  affectedAppointments?: number;
  initial?: Partial<TimeOffBlock>;
  onSave?: (block: TimeOffBlock) => Promise<void> | void;
}

const REASON_OPTIONS: { value: TimeOffReason; label: string }[] = [
  { value: "vacation", label: "Vacation" },
  { value: "conference", label: "Conference" },
  { value: "cme", label: "CME / training" },
  { value: "sick", label: "Sick" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TimeOffBlockForm({
  providerId,
  providerName,
  affectedAppointments = 0,
  initial,
  onSave,
}: TimeOffBlockProps) {
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(initial?.endDate ?? todayIso());
  const [allDay, setAllDay] = useState(initial?.allDay ?? true);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "09:00");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "17:00");
  const [reason, setReason] = useState<TimeOffReason>(initial?.reason ?? "vacation");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const dateError = useMemo(() => {
    if (!startDate || !endDate) return null;
    if (endDate < startDate) return "End date is before start date.";
    if (!allDay && startDate === endDate && endTime <= startTime) {
      return "End time must be after start time.";
    }
    return null;
  }, [startDate, endDate, allDay, startTime, endTime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dateError) return;
    const block: TimeOffBlock = {
      providerId,
      startDate,
      endDate,
      allDay,
      startTime: allDay ? undefined : startTime,
      endTime: allDay ? undefined : endTime,
      reason,
      notes: notes.trim() || undefined,
    };
    setSaving(true);
    try {
      if (onSave) await onSave(block);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Block time off</CardTitle>
        <CardDescription>
          {providerName ? `Hold time on ${providerName}'s calendar.` : "Hold time on the provider's calendar."} Existing appointments in this window will surface for rescheduling.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="to-start-date">Start date</Label>
              <Input
                id="to-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to-end-date">End date</Label>
              <Input
                id="to-end-date"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]/30"
            />
            All day
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="to-start-time">Start time</Label>
                <Input
                  id="to-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to-end-time">End time</Label>
                <Input
                  id="to-end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="to-reason">Reason</Label>
            <select
              id="to-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as TimeOffReason)}
              className="w-full h-11 px-3 bg-white border border-[var(--border)] rounded-xl text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="to-notes">Notes (optional)</Label>
            <Textarea
              id="to-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Visible to schedulers only"
            />
          </div>

          {dateError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{dateError}</div>
          )}

          {!dateError && affectedAppointments > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
              {affectedAppointments} existing appointment{affectedAppointments === 1 ? "" : "s"} fall in this window
              and will need to be moved or canceled.
            </div>
          )}
        </CardContent>
        <CardFooter className="pt-6 border-t border-[var(--border)] flex justify-end">
          <Button type="submit" variant="primary" disabled={saving || !!dateError}>
            {saving ? "Saving…" : "Block time"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default TimeOffBlockForm;
