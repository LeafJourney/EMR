"use client";

/**
 * Chart Kit — shared interactive primitives for the clinician patient chart.
 *
 * Dr. Patel's revision doc reuses the same handful of interactions on every
 * tab: coloured "bubbles" that filter on click, a "Cindy says/sees" AI block,
 * collapsible sections whose state is remembered, per-row acknowledge/dismiss
 * (with a justification popup for red/critical rows that gets time-stamped
 * into Correspondence), and a "Feather" trend popup. Building these once here
 * keeps the colour language and behaviour consistent across Rx, LSV, Records,
 * Images, Memory and Correspondence — and keeps each tab file small.
 *
 * Persistence note: the megasprint forbids schema changes, so "saved
 * preferences" and the acknowledgement/Correspondence ledger are kept in
 * localStorage, namespaced per patient. The shape is stable so a server-backed
 * store can replace the hook later without touching call sites.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Sparkline } from "@/components/ui/sparkline";
import { ModalShell } from "@/components/ui/modal-shell";
import {
  bubbleClass,
  type BubbleTone,
} from "@/lib/clinical/chart-bubbles";
import type { CindyAnalysis } from "@/lib/clinical/cindy-says";

/* ── localStorage helpers ────────────────────────────────────────────── */

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — preference stays in memory only */
  }
}

/** Persisted state hook (localStorage-backed). SSR-safe: seeds from the
 *  initial value then hydrates from storage after mount. */
export function usePersistentState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = React.useState<T>(initial);
  React.useEffect(() => {
    setValue(readLS(key, initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        writeLS(key, resolved);
        return resolved;
      });
    },
    [key],
  );
  return [value, set];
}

/* ── Chart event ledger (acknowledge/dismiss → Correspondence) ───────── */

export interface ChartEvent {
  id: string;
  kind: "acknowledge" | "dismiss" | "note";
  source: string; // e.g. "Interaction check", "Safety check", "Memory"
  subject: string; // what was acted on
  justification?: string;
  at: string; // ISO timestamp
  actor?: string;
}

function eventLedgerKey(patientId: string) {
  return `chart-ledger:${patientId}:v1`;
}

/** Read + append to the per-patient acknowledgement/Correspondence ledger. */
export function useChartLedger(patientId: string) {
  const key = eventLedgerKey(patientId);
  const [events, setEvents] = React.useState<ChartEvent[]>([]);
  React.useEffect(() => {
    setEvents(readLS<ChartEvent[]>(key, []));
  }, [key]);

  const record = React.useCallback(
    (e: Omit<ChartEvent, "id" | "at">) => {
      const full: ChartEvent = {
        ...e,
        id: `evt_${Math.round(performance.now() * 1000)}_${events.length}`,
        at: new Date().toISOString(),
      };
      setEvents((prev) => {
        const next = [full, ...prev];
        writeLS(key, next);
        return next;
      });
      return full;
    },
    [key, events.length],
  );

  return { events, record };
}

/* ── Bubble ──────────────────────────────────────────────────────────── */

export function Bubble({
  tone,
  className,
  emoji,
  active,
  onClick,
  onContextMenu,
  title,
  children,
}: {
  tone?: BubbleTone;
  /** Override classes entirely (e.g. method/identity colours). */
  className?: string;
  emoji?: string;
  /** Selected state when used as a filter chip. */
  active?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  title?: string;
  children: React.ReactNode;
}) {
  const interactive = Boolean(onClick || onContextMenu);
  const classes = className ?? (tone ? bubbleClass(tone) : bubbleClass("beige"));
  return (
    <span
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      title={title}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium rounded-full border tracking-wide whitespace-nowrap",
        classes,
        interactive && "cursor-pointer transition-transform hover:scale-105",
        active && "ring-2 ring-offset-1 ring-accent/60",
      )}
    >
      {emoji && <span aria-hidden="true">{emoji}</span>}
      {children}
    </span>
  );
}

export interface FilterBubble {
  key: string;
  label: string;
  tone?: BubbleTone;
  className?: string;
  emoji?: string;
  count?: number;
}

/** A row of click-to-filter bubbles. Controlled via `selected`/`onSelect`. */
export function BubbleStrip({
  bubbles,
  selected,
  onSelect,
  emojiOnly = false,
}: {
  bubbles: FilterBubble[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** EMR-859 — optionally render emoji-only chips. */
  emojiOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {bubbles.map((b) => (
        <Bubble
          key={b.key}
          tone={b.tone}
          className={b.className}
          emoji={b.emoji}
          active={selected === b.key}
          title={b.label}
          onClick={() => onSelect(selected === b.key ? null : b.key)}
        >
          {emojiOnly && b.emoji ? "" : b.label}
          {b.count != null && (
            <span className="ml-0.5 opacity-60 tabular-nums">{b.count}</span>
          )}
        </Bubble>
      ))}
    </div>
  );
}

/* ── Cindy says/sees/summary block ───────────────────────────────────── */

export function CindySays({
  analysis,
  className,
}: {
  analysis: CindyAnalysis;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-accent/20 bg-accent-soft/40 px-3.5 py-2.5",
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent mb-1">
        <span aria-hidden="true">🪶</span>
        {analysis.prefix}
      </p>
      <ul className="space-y-1">
        {analysis.bullets.map((b, i) => (
          <li key={i} className="text-[13px] text-text leading-snug flex gap-1.5">
            <span className="text-accent/60 select-none">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Collapsible section with remembered state ───────────────────────── */

export function CollapsibleSection({
  storageKey,
  title,
  meta,
  defaultOpen = true,
  right,
  children,
  className,
}: {
  /** When set, open/closed state is persisted per chart. */
  storageKey?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [persistedOpen, setPersistedOpen] = usePersistentState<boolean>(
    storageKey ?? "__inmem__",
    defaultOpen,
  );
  const [localOpen, setLocalOpen] = React.useState(defaultOpen);
  const open = storageKey ? persistedOpen : localOpen;
  const setOpen = storageKey ? setPersistedOpen : setLocalOpen;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left min-w-0"
        >
          <span
            className={cn(
              "text-text-subtle transition-transform shrink-0 select-none",
              open && "rotate-90",
            )}
            aria-hidden="true"
          >
            ›
          </span>
          <span className="flex-1 min-w-0 text-sm font-medium text-text truncate">
            {title}
          </span>
          {meta && (
            <span className="text-[11px] text-text-subtle shrink-0">{meta}</span>
          )}
        </button>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/* ── Acknowledge / Dismiss row (justification-gated for critical) ────── */

export type ResolveAction = "acknowledge" | "dismiss";

export function AckDismissControls({
  isCritical,
  resolved,
  onResolve,
  size = "sm",
}: {
  /** Red/critical rows cannot be resolved without a justification. */
  isCritical: boolean;
  resolved?: { action: ResolveAction; justification?: string; at: string } | null;
  onResolve: (action: ResolveAction, justification?: string) => void;
  size?: "sm" | "xs";
}) {
  const [pending, setPending] = React.useState<ResolveAction | null>(null);
  const [justification, setJustification] = React.useState("");

  if (resolved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-text-subtle">
        <span
          className={cn(
            "font-medium",
            resolved.action === "acknowledge" ? "text-success" : "text-text-muted",
          )}
        >
          {resolved.action === "acknowledge" ? "✓ Acknowledged" : "Dismissed"}
        </span>
        <span className="tabular-nums">
          {new Date(resolved.at).toLocaleString()}
        </span>
      </span>
    );
  }

  const btn =
    size === "xs"
      ? "px-2 py-0.5 text-[10px]"
      : "px-2.5 py-1 text-[11px]";

  function attempt(action: ResolveAction) {
    if (isCritical) {
      setPending(action);
    } else {
      onResolve(action);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1.5">
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => attempt("acknowledge")}
          className={cn(
            btn,
            "rounded-md font-medium border border-green-300 bg-green-50 text-green-800 hover:bg-green-100 transition-colors",
          )}
        >
          Acknowledge
        </button>
        <button
          type="button"
          onClick={() => attempt("dismiss")}
          className={cn(
            btn,
            "rounded-md font-medium border border-border text-text-muted hover:bg-surface-muted transition-colors",
          )}
        >
          Dismiss
        </button>
      </div>

      {pending && (
        <div className="w-64 rounded-lg border border-red-300 bg-red-50 p-2.5 shadow-sm text-left">
          <p className="text-[11px] font-medium text-danger mb-1">
            Justification required to {pending} a critical item
          </p>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Clinical reasoning…"
            className="w-full text-xs rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex justify-end gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setJustification("");
              }}
              className="px-2 py-0.5 text-[11px] rounded-md text-text-muted hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!justification.trim()}
              onClick={() => {
                onResolve(pending, justification.trim());
                setPending(null);
                setJustification("");
              }}
              className="px-2 py-0.5 text-[11px] rounded-md font-medium bg-danger text-white disabled:opacity-40"
            >
              Confirm {pending}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Feather trend popup ─────────────────────────────────────────────── */

export function FeatherTrend({
  label,
  series,
  unit,
  analysis,
  triggerClassName,
}: {
  label: string;
  series: number[];
  unit?: string;
  analysis: CindyAnalysis;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Trend & Cindy analysis for ${label}`}
        aria-label={`Open trend analysis for ${label}`}
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-accent-soft transition-colors text-sm",
          triggerClassName,
        )}
      >
        <span aria-hidden="true">🪶</span>
      </button>
      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="Trend analysis"
        title={label}
        placement="center"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-muted/40 p-4 flex justify-center">
            {series.length >= 2 ? (
              <Sparkline data={series} width={420} height={140} />
            ) : (
              <p className="text-sm text-text-muted py-8">
                Not enough data points to chart a trend yet.
              </p>
            )}
          </div>
          {series.length > 0 && (
            <div className="flex flex-wrap gap-4 text-xs text-text-muted tabular-nums">
              <span>Latest: <b className="text-text">{series[series.length - 1]}{unit ? ` ${unit}` : ""}</b></span>
              <span>Min: {Math.min(...series)}{unit ? ` ${unit}` : ""}</span>
              <span>Max: {Math.max(...series)}{unit ? ` ${unit}` : ""}</span>
              <span>Points: {series.length}</span>
            </div>
          )}
          <CindySays analysis={analysis} />
        </div>
      </ModalShell>
    </>
  );
}

/* ── Generic re-export of ModalShell for tab popups ──────────────────── */
export { ModalShell };
