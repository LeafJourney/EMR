"use client";

/**
 * Chart alerts / reminders (EMR-851).
 *
 * A small "Alert" label under the patient monogram. Clicking opens a popup
 * with the patient's chart alerts as a bulleted list, a free-text box to add
 * a new one (save), and the ability to delete old ones. The same mechanism
 * doubles as a provider reminder / sticky-note system. Persisted per patient
 * in localStorage (no schema change permitted this sprint).
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { usePersistentState } from "./chart-kit";

interface AlertEntry {
  id: string;
  text: string;
  kind: "alert" | "reminder";
  at: string;
}

export function AlertsButton({ patientId }: { patientId: string }) {
  const [open, setOpen] = React.useState(false);
  const [alerts, setAlerts] = usePersistentState<AlertEntry[]>(
    `chart-alerts:${patientId}:v1`,
    [],
  );
  const [draft, setDraft] = React.useState("");
  const [kind, setKind] = React.useState<"alert" | "reminder">("alert");
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  function add() {
    if (!draft.trim()) return;
    setAlerts((prev) => [
      { id: `al_${Date.now()}`, text: draft.trim(), kind, at: new Date().toISOString() },
      ...prev,
    ]);
    setDraft("");
  }

  function remove(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--warning)] hover:underline",
          alerts.length > 0 && "font-semibold",
        )}
        title="Chart alerts & reminders"
      >
        <span aria-hidden="true">⚠</span>
        Alert{alerts.length > 0 ? ` (${alerts.length})` : ""}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-2 left-0 w-80 rounded-xl border border-border bg-surface-raised shadow-xl p-3.5 space-y-3">
          <p className="text-sm font-semibold text-text flex items-center gap-1.5">
            <span aria-hidden="true">⚠</span> Alert
          </p>

          {alerts.length === 0 ? (
            <p className="text-xs text-text-muted italic">
              No alerts or reminders yet.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-44 overflow-y-auto">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-2 text-xs"
                >
                  <span className="flex gap-1.5">
                    <span className={a.kind === "reminder" ? "text-info" : "text-danger"}>
                      {a.kind === "reminder" ? "🔖" : "•"}
                    </span>
                    <span className="text-text">{a.text}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    className="text-text-subtle hover:text-danger shrink-0"
                    aria-label="Delete"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border/60 pt-2.5 space-y-2">
            <div className="flex gap-1.5">
              {(["alert", "reminder"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "px-2 py-0.5 text-[11px] rounded-full border capitalize",
                    kind === k
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-border text-text-muted",
                  )}
                >
                  {k}
                </button>
              ))}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={
                kind === "reminder"
                  ? "Reminder for next time you open this chart…"
                  : "New clinical alert…"
              }
              className="w-full text-xs rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent resize-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={add}
                disabled={!draft.trim()}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-accent text-accent-ink disabled:opacity-40 hover:bg-accent-strong"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
