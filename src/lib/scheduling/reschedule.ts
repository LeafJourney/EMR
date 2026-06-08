/**
 * EMR-921 / EMR-578 — pure date math for drag-to-reschedule.
 *
 * Moving an appointment to a different calendar day preserves its time-of-day
 * and duration; only the date changes. Kept pure (no Prisma / IO) so it is
 * unit-testable; the server action in ops/schedule/actions.ts wraps it with
 * auth + persistence. Date parts are read/written in the same (local) basis the
 * schedule page uses to bucket days (isSameDay on local date parts), so a moved
 * appointment re-buckets into the column it was dropped on.
 */
export interface RescheduledRange {
  start: Date;
  end: Date;
  /** True when the target day differs from the original calendar day. */
  moved: boolean;
}

export function rescheduleToDay(
  startAt: Date,
  endAt: Date,
  targetDay: Date,
): RescheduledRange {
  const start = new Date(startAt);
  start.setFullYear(targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate());
  const durationMs = Math.max(0, endAt.getTime() - startAt.getTime());
  const end = new Date(start.getTime() + durationMs);
  const moved = start.getTime() !== startAt.getTime();
  return { start, end, moved };
}
