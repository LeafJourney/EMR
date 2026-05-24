"use client";

/**
 * DatePicker / DateRangePicker / TimePicker primitives
 * ----------------------------------------------------
 * Stripe / Linear-tier inline calendar built on pure React + Tailwind + the
 * browser's `Intl.DateTimeFormat`. No new deps.
 *
 * Why a custom primitive?
 * - Native `<input type="date">` renders inconsistently across Chrome / Safari
 *   / Firefox / iOS Safari (popover style, locale, keyboard nav). On macOS
 *   Safari the popover is a tiny ugly stepper.
 * - We want one Apple-iOS-feel control across audit filters, scheduling, lab
 *   orders, patient DOB entry, insurance dates, etc.
 *
 * Wire format: every public value is an ISO date string `YYYY-MM-DD`. This
 * stays compatible with every existing `<input type="date">` consumer, server
 * actions that already accept `YYYY-MM-DD`, and `new Date(value)` parsing.
 *
 * Accessibility:
 * - role="dialog" on the popover, `aria-label` on the calendar grid
 * - day cells are buttons with `aria-pressed` for the selected day and
 *   `aria-current="date"` for today
 * - arrow keys move a focus cursor, Enter selects, Esc closes, Tab leaves the
 *   popover. We also restore focus to the trigger input on close.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Date helpers — kept local so we don't add date-fns / dayjs.
// All functions treat dates as LOCAL calendar dates (no UTC offset surprises
// for inputs like "1990-04-12" representing a birthday in the user's tz).
// ---------------------------------------------------------------------------

/** ISO `YYYY-MM-DD` from a Date, using its LOCAL components. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse `YYYY-MM-DD` into a LOCAL Date at midnight. Returns null on bad input. */
export function fromISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Guard against e.g. 2025-02-30 silently rolling forward.
  if (
    d.getFullYear() !== Number(m[1]) ||
    d.getMonth() !== Number(m[2]) - 1 ||
    d.getDate() !== Number(m[3])
  ) {
    return null;
  }
  return d;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}
function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

const longFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const monthYearFmt = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

export function formatDisplay(d: Date | null): string {
  return d ? longFmt.format(d) : "";
}

// Sunday-first weekday short labels, localized to the user's runtime.
function weekdayLabels(): string[] {
  const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  // 2024-01-07 is a Sunday — anchor against it to get Sun..Sat order.
  const anchor = new Date(2024, 0, 7);
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i)).slice(0, 2)
  );
}

// ---------------------------------------------------------------------------
// Calendar — the inline month grid. Used by all three pickers.
// ---------------------------------------------------------------------------

type CalendarProps = {
  /** Month being displayed (any date in that month). */
  viewMonth: Date;
  /** Single-mode selected date, OR range start when mode="range". */
  selected: Date | null;
  /** Range end when mode="range". */
  selectedEnd?: Date | null;
  /** Hover preview end for range selection. */
  hoverEnd?: Date | null;
  /** Day that the keyboard cursor sits on (focus highlight). */
  cursor: Date;
  mode: "single" | "range";
  min?: Date | null;
  max?: Date | null;
  disabledDate?: (d: Date) => boolean;
  onPick: (d: Date) => void;
  onHover?: (d: Date | null) => void;
  onMonthChange: (next: Date) => void;
  setCursor: (d: Date) => void;
  todayLabel?: string;
};

function Calendar(props: CalendarProps) {
  const {
    viewMonth,
    selected,
    selectedEnd,
    hoverEnd,
    cursor,
    mode,
    min,
    max,
    disabledDate,
    onPick,
    onHover,
    onMonthChange,
    setCursor,
    todayLabel = "Today",
  } = props;

  const today = React.useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);
  const weekdays = React.useMemo(() => weekdayLabels(), []);
  const monthStart = startOfMonth(viewMonth);
  const startOffset = monthStart.getDay(); // 0=Sun
  const gridStart = addDays(monthStart, -startOffset);

  // 6 weeks × 7 days = 42 cells — stable layout, no jitter between months.
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(gridStart, i));

  function isDisabled(d: Date): boolean {
    if (min && isBefore(d, min)) return true;
    if (max && isAfter(d, max)) return true;
    if (disabledDate?.(d)) return true;
    return false;
  }

  function inRange(d: Date): boolean {
    if (mode !== "range" || !selected) return false;
    const end = selectedEnd ?? hoverEnd;
    if (!end) return false;
    const [a, b] = isBefore(selected, end) ? [selected, end] : [end, selected];
    return !isBefore(d, a) && !isAfter(d, b);
  }

  return (
    <div className="w-[18rem] select-none">
      {/* Header: month label + nav arrows */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(viewMonth, -1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-subtle hover:bg-muted/50 hover:text-text transition-colors"
          aria-label="Previous month"
        >
          {/* chevron-left */}
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 4 6 10l6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="text-sm font-semibold text-text">
          {monthYearFmt.format(viewMonth)}
        </div>
        <button
          type="button"
          onClick={() => onMonthChange(addMonths(viewMonth, 1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-subtle hover:bg-muted/50 hover:text-text transition-colors"
          aria-label="Next month"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {weekdays.map((w, i) => (
          <div key={i} className="text-[10px] font-medium text-text-subtle uppercase tracking-wider text-center py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendar">
        {cells.map((d, i) => {
          const outside = d.getMonth() !== viewMonth.getMonth();
          const disabled = isDisabled(d);
          const isToday = isSameDay(d, today);
          const isSelected =
            (selected && isSameDay(d, selected)) ||
            (selectedEnd && isSameDay(d, selectedEnd));
          const isCursor = isSameDay(d, cursor);
          const inRng = inRange(d);

          return (
            <button
              type="button"
              key={i}
              disabled={disabled}
              tabIndex={-1}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover?.(d)}
              onFocus={() => setCursor(d)}
              aria-pressed={!!isSelected}
              aria-current={isToday ? "date" : undefined}
              aria-label={longFmt.format(d)}
              className={cn(
                "relative h-8 w-8 rounded-md text-sm transition-colors",
                "focus:outline-none",
                outside && "text-text-subtle/40",
                !outside && !isSelected && "text-text hover:bg-muted/60",
                disabled && "opacity-30 cursor-not-allowed hover:bg-transparent",
                inRng && !isSelected && "bg-accent/15",
                isSelected && "bg-accent text-accent-foreground font-semibold shadow-sm",
                isCursor && !isSelected && "ring-2 ring-accent/40",
                isToday && !isSelected && "font-semibold"
              )}
            >
              {d.getDate()}
              {isToday && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      {/* Today button */}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            onMonthChange(startOfMonth(today));
            setCursor(today);
            if (!isDisabled(today)) onPick(today);
          }}
          className="text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 rounded px-1"
        >
          {todayLabel}
        </button>
        <span className="text-[10px] text-text-subtle">
          {/* keyboard hint — quietly educational, Stripe-style */}
          {"←↑↓→"} move &middot; Enter select &middot; Esc close
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Popover wrapper — handles outside click + escape + focus return.
// ---------------------------------------------------------------------------

function usePopover(triggerRef: React.RefObject<HTMLElement | null>) {
  const [open, setOpen] = React.useState(false);
  const popRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, triggerRef]);

  return { open, setOpen, popRef };
}

// ---------------------------------------------------------------------------
// DatePicker — single mode
// ---------------------------------------------------------------------------

export type DatePickerProps = {
  /** ISO `YYYY-MM-DD` value (controlled). */
  value?: string | null;
  /** Default ISO value for uncontrolled usage. */
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  /** Optional hidden input name for form submission. */
  name?: string;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  /** `YYYY-MM-DD`. */
  min?: string;
  /** `YYYY-MM-DD`. */
  max?: string;
  /** Custom disabled predicate, called per-day. */
  disabledDate?: (d: Date) => boolean;
  className?: string;
  /** Triggered on input blur. */
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  function DatePicker(
    {
      value,
      defaultValue,
      onChange,
      name,
      id,
      placeholder = "Select date",
      disabled,
      required,
      min,
      max,
      disabledDate,
      className,
      onBlur,
      ...aria
    },
    ref
  ) {
    const isControlled = value !== undefined;
    const [internal, setInternal] = React.useState<string>(defaultValue ?? "");
    const current = isControlled ? value ?? "" : internal;
    const currentDate = fromISODate(current);

    const triggerRef = React.useRef<HTMLInputElement | null>(null);
    React.useImperativeHandle(ref, () => triggerRef.current!, []);
    const { open, setOpen, popRef } = usePopover(triggerRef);

    const minDate = fromISODate(min);
    const maxDate = fromISODate(max);

    const [viewMonth, setViewMonth] = React.useState<Date>(
      currentDate ?? new Date()
    );
    const [cursor, setCursor] = React.useState<Date>(currentDate ?? new Date());

    // Re-anchor view + cursor whenever the popover opens — so reopening on a
    // pre-filled value shows that month, not the last month we navigated to.
    React.useEffect(() => {
      if (open) {
        const anchor = currentDate ?? new Date();
        setViewMonth(startOfMonth(anchor));
        setCursor(anchor);
      }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    function commit(d: Date) {
      const iso = toISODate(d);
      if (!isControlled) setInternal(iso);
      onChange?.(iso);
      setOpen(false);
      // Defer focus return so the popover unmount doesn't fight us.
      requestAnimationFrame(() => triggerRef.current?.focus());
    }

    function onTriggerKeyDown(e: React.KeyboardEvent) {
      // Open with arrow / enter / space if closed; else delegate to grid keys.
      if (!open) {
        if (["ArrowDown", "Enter", " "].includes(e.key)) {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = addDays(cursor, -1);
        setCursor(next);
        if (next.getMonth() !== viewMonth.getMonth()) setViewMonth(startOfMonth(next));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = addDays(cursor, 1);
        setCursor(next);
        if (next.getMonth() !== viewMonth.getMonth()) setViewMonth(startOfMonth(next));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = addDays(cursor, -7);
        setCursor(next);
        if (next.getMonth() !== viewMonth.getMonth()) setViewMonth(startOfMonth(next));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = addDays(cursor, 7);
        setCursor(next);
        if (next.getMonth() !== viewMonth.getMonth()) setViewMonth(startOfMonth(next));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (
          (!minDate || !isBefore(cursor, minDate)) &&
          (!maxDate || !isAfter(cursor, maxDate)) &&
          !disabledDate?.(cursor)
        ) {
          commit(cursor);
        }
      }
    }

    return (
      <div className={cn("relative inline-block w-full", className)}>
        <input
          ref={triggerRef}
          id={id}
          type="text"
          readOnly
          inputMode="none"
          disabled={disabled}
          required={required}
          value={formatDisplay(currentDate)}
          placeholder={placeholder}
          onFocus={() => !disabled && setOpen(true)}
          onClick={() => !disabled && setOpen(true)}
          onBlur={onBlur}
          onKeyDown={onTriggerKeyDown}
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? `${id || "datepicker"}-popover` : undefined}
          {...aria}
          className={cn(
            "flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 pr-9 text-sm text-text",
            "placeholder:text-text-subtle cursor-pointer",
            "transition-colors duration-200 ease-smooth",
            "focus:outline-none focus-visible:outline-none",
            "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30",
            "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        />
        {/* Calendar icon */}
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-subtle"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <rect x="3" y="4.5" width="14" height="13" rx="2" />
          <path d="M3 8h14M7 3v3M13 3v3" strokeLinecap="round" />
        </svg>

        {/* Hidden input so the picker works in plain <form> submissions. */}
        {name && (
          <input type="hidden" name={name} value={current} />
        )}

        {open && (
          <div
            ref={popRef}
            id={`${id || "datepicker"}-popover`}
            role="dialog"
            aria-label="Choose date"
            className={cn(
              "absolute z-50 mt-2 left-0 rounded-xl border border-border-strong bg-surface p-3 shadow-xl",
              "animate-in fade-in-0 zoom-in-95 duration-150"
            )}
          >
            <Calendar
              mode="single"
              viewMonth={viewMonth}
              selected={currentDate}
              cursor={cursor}
              min={minDate}
              max={maxDate}
              disabledDate={disabledDate}
              onPick={commit}
              onMonthChange={setViewMonth}
              setCursor={setCursor}
            />
          </div>
        )}
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// DateRangePicker — two ISO values, single calendar with range highlight.
// ---------------------------------------------------------------------------

export type DateRange = { from: string | null; to: string | null };

export type DateRangePickerProps = {
  value?: DateRange;
  defaultValue?: DateRange;
  onChange?: (range: DateRange) => void;
  nameFrom?: string;
  nameTo?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  disabledDate?: (d: Date) => boolean;
  className?: string;
};

export function DateRangePicker({
  value,
  defaultValue,
  onChange,
  nameFrom,
  nameTo,
  placeholder = "Select range",
  disabled,
  min,
  max,
  disabledDate,
  className,
}: DateRangePickerProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<DateRange>(
    defaultValue ?? { from: null, to: null }
  );
  const current: DateRange = isControlled ? value! : internal;
  const fromDate = fromISODate(current.from);
  const toDate = fromISODate(current.to);

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const { open, setOpen, popRef } = usePopover(triggerRef);

  const [viewMonth, setViewMonth] = React.useState<Date>(
    fromDate ?? new Date()
  );
  const [cursor, setCursor] = React.useState<Date>(fromDate ?? new Date());
  const [hoverEnd, setHoverEnd] = React.useState<Date | null>(null);

  React.useEffect(() => {
    if (open) {
      const anchor = fromDate ?? new Date();
      setViewMonth(startOfMonth(anchor));
      setCursor(anchor);
      setHoverEnd(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function emit(next: DateRange) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
  }

  function onPick(d: Date) {
    // Two-tap selection: first tap sets start, second tap sets end.
    if (!fromDate || (fromDate && toDate)) {
      emit({ from: toISODate(d), to: null });
    } else {
      const [a, b] = isBefore(d, fromDate) ? [d, fromDate] : [fromDate, d];
      emit({ from: toISODate(a), to: toISODate(b) });
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  const label = React.useMemo(() => {
    if (fromDate && toDate) return `${formatDisplay(fromDate)} – ${formatDisplay(toDate)}`;
    if (fromDate) return `${formatDisplay(fromDate)} – ...`;
    return "";
  }, [fromDate, toDate]);

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex h-10 min-w-[16rem] items-center justify-between rounded-md border border-border-strong bg-surface px-3 text-sm",
          "text-left transition-colors duration-200 ease-smooth",
          label ? "text-text" : "text-text-subtle",
          "focus:outline-none focus-visible:outline-none",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        <span className="truncate">{label || placeholder}</span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="ml-2 h-4 w-4 text-text-subtle shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <rect x="3" y="4.5" width="14" height="13" rx="2" />
          <path d="M3 8h14M7 3v3M13 3v3" strokeLinecap="round" />
        </svg>
      </button>
      {nameFrom && <input type="hidden" name={nameFrom} value={current.from ?? ""} />}
      {nameTo && <input type="hidden" name={nameTo} value={current.to ?? ""} />}

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Choose date range"
          className="absolute z-50 mt-2 left-0 rounded-xl border border-border-strong bg-surface p-3 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <Calendar
            mode="range"
            viewMonth={viewMonth}
            selected={fromDate}
            selectedEnd={toDate}
            hoverEnd={hoverEnd}
            cursor={cursor}
            min={fromISODate(min)}
            max={fromISODate(max)}
            disabledDate={disabledDate}
            onPick={onPick}
            onHover={(d) => {
              if (fromDate && !toDate) setHoverEnd(d);
            }}
            onMonthChange={setViewMonth}
            setCursor={setCursor}
          />
          <div className="mt-2 flex justify-end gap-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                emit({ from: null, to: null });
                setHoverEnd(null);
              }}
              className="text-xs text-text-subtle hover:text-text"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TimePicker — HH:MM with configurable minute step. Lightweight by design:
// a dropdown-style listbox of pre-baked time slots, plus a free-type input
// for power users who'd rather just type "9:15".
// ---------------------------------------------------------------------------

export type TimePickerProps = {
  /** 24-hour `HH:MM` value. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  /** Minute granularity for the slot list. Default 15. */
  step?: 5 | 10 | 15 | 30 | 60;
  /** Earliest selectable, `HH:MM`. Default `00:00`. */
  min?: string;
  /** Latest selectable, `HH:MM`. Default `23:59`. */
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

function parseHHMM(s: string | null | undefined): { h: number; m: number } | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

function formatHHMM({ h, m }: { h: number; m: number }): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function displayTime(hm: { h: number; m: number } | null): string {
  if (!hm) return "";
  const d = new Date(2000, 0, 1, hm.h, hm.m);
  return timeFmt.format(d);
}

export function TimePicker({
  value,
  defaultValue,
  onChange,
  name,
  id,
  step = 15,
  min = "00:00",
  max = "23:59",
  placeholder = "Select time",
  disabled,
  className,
}: TimePickerProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState<string>(defaultValue ?? "");
  const current = isControlled ? value ?? "" : internal;
  const currentHm = parseHHMM(current);

  const triggerRef = React.useRef<HTMLInputElement | null>(null);
  const { open, setOpen, popRef } = usePopover(triggerRef);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const minHm = parseHHMM(min) ?? { h: 0, m: 0 };
  const maxHm = parseHHMM(max) ?? { h: 23, m: 59 };

  const slots = React.useMemo<string[]>(() => {
    const out: string[] = [];
    const startMin = minHm.h * 60 + minHm.m;
    const endMin = maxHm.h * 60 + maxHm.m;
    for (let t = startMin; t <= endMin; t += step) {
      out.push(formatHHMM({ h: Math.floor(t / 60), m: t % 60 }));
    }
    return out;
  }, [step, minHm.h, minHm.m, maxHm.h, maxHm.m]);

  function commit(hhmm: string) {
    if (!isControlled) setInternal(hhmm);
    onChange?.(hhmm);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  // Scroll the selected slot into view when opening.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLButtonElement>("[data-active=true]");
    el?.scrollIntoView({ block: "center" });
  }, [open]);

  // Allow free typing — accept `9:15`, `09:15`, `915` -> 9:15.
  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (!isControlled) setInternal(raw);
    onChange?.(raw); // emit raw; we'll normalize on blur
  }
  function onInputBlur() {
    const raw = current.trim();
    if (!raw) return;
    let m = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!m) {
      // try `915` / `0915` shorthand
      const digits = raw.replace(/\D/g, "");
      if (digits.length === 3 || digits.length === 4) {
        const hh = digits.length === 3 ? digits.slice(0, 1) : digits.slice(0, 2);
        const mm = digits.slice(-2);
        m = ["", hh, mm] as unknown as RegExpExecArray;
      }
    }
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
        commit(formatHHMM({ h, m: min }));
        return;
      }
    }
    // Invalid — revert to empty.
    if (!isControlled) setInternal("");
    onChange?.("");
  }

  return (
    <div className={cn("relative inline-block w-full", className)}>
      <input
        ref={triggerRef}
        id={id}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={currentHm ? displayTime(currentHm) : current}
        placeholder={placeholder}
        onChange={onInputChange}
        onFocus={() => !disabled && setOpen(true)}
        onClick={() => !disabled && setOpen(true)}
        onBlur={onInputBlur}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id || "timepicker"}-listbox` : undefined}
        className={cn(
          "flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 pr-9 text-sm text-text",
          "placeholder:text-text-subtle",
          "transition-colors duration-200 ease-smooth",
          "focus:outline-none focus-visible:outline-none",
          "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      />
      {/* Clock icon */}
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6v4l2.5 1.5" strokeLinecap="round" />
      </svg>
      {name && <input type="hidden" name={name} value={current} />}

      {open && (
        <div
          ref={popRef}
          id={`${id || "timepicker"}-listbox`}
          role="listbox"
          aria-label="Choose time"
          className="absolute z-50 mt-2 left-0 right-0 max-h-56 overflow-y-auto rounded-xl border border-border-strong bg-surface py-1 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div ref={listRef}>
            {slots.map((s) => {
              const hm = parseHHMM(s);
              const active = current === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent input blur firing first
                    commit(s);
                  }}
                  className={cn(
                    "block w-full text-left px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-accent text-accent-foreground font-medium" : "text-text hover:bg-muted/60"
                  )}
                >
                  {displayTime(hm)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
