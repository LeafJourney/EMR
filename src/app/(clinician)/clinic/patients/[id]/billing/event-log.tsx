"use client";

import { useState } from "react";

// EMR-910 — Collapsible financial event log.
// Older records collapse behind a toggle so the recent activity stays the
// focus. Money is pre-formatted server-side (amountLabel) so this client
// component never imports the billing/prisma layer.
export interface EventLogItem {
  id: string;
  description: string;
  /** Pre-formatted, signed amount (e.g. "+$50.00") or "" when zero. */
  amountLabel: string;
  /** Tailwind class for the amount text tone. */
  amountClass: string;
  /** Pre-formatted relative time + type line. */
  meta: string;
  /** Dot color (CSS var). */
  color: string;
}

export function EventLog({
  events,
  initialVisible = 5,
}: {
  events: EventLogItem[];
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) {
    return (
      <p className="text-sm text-text-muted text-center py-4">
        No financial events recorded.
      </p>
    );
  }

  const visible = expanded ? events : events.slice(0, initialVisible);
  const hiddenCount = events.length - visible.length;

  return (
    <>
      <ul className="space-y-3">
        {visible.map((event) => (
          <li key={event.id} className="flex items-start gap-3 text-sm">
            <span
              className="mt-1.5 h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: event.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-text">{event.description}</p>
                {event.amountLabel && (
                  <span className={`tabular-nums text-sm font-medium ${event.amountClass}`}>
                    {event.amountLabel}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-subtle mt-0.5">{event.meta}</p>
            </div>
          </li>
        ))}
      </ul>

      {events.length > initialVisible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 text-xs font-medium text-accent hover:text-accent-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
        >
          {expanded ? "Collapse older activity" : `Show ${hiddenCount} older ${hiddenCount === 1 ? "record" : "records"}`}
        </button>
      )}
    </>
  );
}
