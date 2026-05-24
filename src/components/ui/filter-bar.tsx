"use client";

// FilterBar — shared filter/sort primitives for operator surfaces.
//
// Built to bring Monday/Linear-tier polish to data tables and lists across
// the (operator) and (super-admin) routes. Three composable pieces:
//
//   - <FilterChips>        — active-filter chips with per-chip X + Clear all
//   - <MultiSelectFilter>  — categorical multi-select with checkbox popover
//   - <SortMenu>           — sort dropdown (key + direction)
//   - <SavedViewsBar>      — saved view stub backed by localStorage
//   - <EmptyFilterState>   — warm zero-result state with "Clear filters" CTA
//
// All primitives are unstyled-leaning Tailwind, lean on existing tokens
// (surface, border, accent, text-muted) so they inherit the EMR look.
// Tap targets are >= 36px (h-9) per the spec.

import * as React from "react";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------- chips

export type ActiveChip = {
  /** Stable id used as React key and to identify the chip for onRemove. */
  id: string;
  /** Filter family — shown in muted weight before the value. */
  label: string;
  /** Selected value(s) — shown in regular weight. Array renders "a, b". */
  value: string | string[];
};

export function FilterChips({
  chips,
  onRemove,
  onClearAll,
  className,
}: {
  chips: ActiveChip[];
  onRemove: (id: string) => void;
  onClearAll?: () => void;
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Active filters"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {chips.map((chip) => {
        const valueText = Array.isArray(chip.value)
          ? chip.value.join(", ")
          : chip.value;
        return (
          <span
            key={chip.id}
            className={cn(
              "inline-flex items-center gap-1.5 h-9 pl-3 pr-1 rounded-full",
              "bg-accent-soft text-accent border border-accent/25",
              "text-xs font-medium",
            )}
          >
            <span className="text-accent/70 font-normal">{chip.label}:</span>
            <span className="max-w-[180px] truncate">{valueText}</span>
            <button
              type="button"
              onClick={() => onRemove(chip.id)}
              aria-label={`Remove ${chip.label} filter`}
              className={cn(
                "inline-flex items-center justify-center h-7 w-7 rounded-full",
                "text-accent/70 hover:text-accent hover:bg-accent/10",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                "transition-colors",
              )}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 3L9 9M9 3L3 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        );
      })}
      {onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className={cn(
            "h-9 px-3 rounded-full text-xs font-medium",
            "text-text-muted hover:text-text underline-offset-2 hover:underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            "transition-colors",
          )}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------- multi-select

export type MultiSelectOption = {
  value: string;
  label: string;
};

export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  placeholder,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Shown when no values are selected. Defaults to label. */
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // Close on outside click. Cheap — no portal, no body scroll lock.
  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const hint =
    selected.length === 0
      ? (placeholder ?? label)
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 h-9 px-3 rounded-md",
          "border border-border-strong bg-surface text-sm text-text",
          "hover:bg-surface-muted/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          "transition-colors",
          selected.length > 0 && "border-accent/40 bg-accent-soft/40",
        )}
      >
        <span className="text-text-muted text-xs">{label}</span>
        <span className="font-medium">{hint}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className={cn(
            "absolute z-30 mt-1 min-w-[200px] max-h-[280px] overflow-y-auto",
            "rounded-lg border border-border-strong bg-surface shadow-lg",
            "py-1",
          )}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-subtle">
              No options
            </div>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 h-9",
                    "text-sm text-text text-left",
                    "hover:bg-accent-soft/50",
                    "focus-visible:outline-none focus-visible:bg-accent-soft/60",
                    "transition-colors",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-flex items-center justify-center h-4 w-4 rounded",
                      "border",
                      checked
                        ? "border-accent bg-accent text-white"
                        : "border-border-strong bg-surface",
                    )}
                  >
                    {checked && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        aria-hidden="true"
                      >
                        <path
                          d="M2 5L4.5 7.5L8 3"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="flex-1">{opt.label}</span>
                </button>
              );
            })
          )}
          {selected.length > 0 && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => onChange([])}
                className={cn(
                  "flex w-full items-center px-3 h-9 text-xs text-text-muted",
                  "hover:bg-surface-muted/60 hover:text-text",
                  "transition-colors",
                )}
              >
                Clear {label.toLowerCase()}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------- sort menu

export type SortOption = {
  value: string;
  label: string;
};

export function SortMenu({
  label = "Sort",
  options,
  value,
  onChange,
}: {
  label?: string;
  options: SortOption[];
  value: string;
  onChange: (next: string) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <label className="inline-flex items-center gap-2 text-sm text-text-muted">
      <span className="text-xs">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className={cn(
            "appearance-none h-9 pl-3 pr-8 rounded-md",
            "border border-border-strong bg-surface text-sm text-text",
            "hover:bg-surface-muted/60",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            "transition-colors",
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          aria-hidden="true"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        <span className="sr-only">{current}</span>
      </span>
    </label>
  );
}

// --------------------------------------------------------- saved views

export type SavedView<S> = {
  id: string;
  name: string;
  state: S;
};

/**
 * Saved-view bar backed by localStorage.
 *
 * Stub — no schema work. Stores under `lj.savedViews.<key>` so each surface
 * gets its own namespace. The active view is also persisted under
 * `lj.savedViews.<key>.active`.
 *
 * SSR-safe: reads localStorage lazily inside an effect, returns null while
 * hydrating to avoid mismatches.
 */
export function SavedViewsBar<S>({
  storageKey,
  currentState,
  isDefault,
  onApply,
  onReset,
  serialize = (s) => JSON.stringify(s),
  className,
}: {
  storageKey: string;
  currentState: S;
  /** Returns true if state matches the implicit "default" view (no filters). */
  isDefault: (s: S) => boolean;
  onApply: (state: S) => void;
  onReset: () => void;
  serialize?: (s: S) => string;
  className?: string;
}) {
  const [hydrated, setHydrated] = React.useState(false);
  const [views, setViews] = React.useState<SavedView<S>[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [naming, setNaming] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");

  const lsKey = `lj.savedViews.${storageKey}`;
  const lsActiveKey = `${lsKey}.active`;

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(lsKey);
      if (raw) setViews(JSON.parse(raw) as SavedView<S>[]);
      const active = window.localStorage.getItem(lsActiveKey);
      if (active) setActiveId(active);
    } catch {
      // ignore — corrupt JSON or storage blocked
    }
    setHydrated(true);
  }, [lsKey, lsActiveKey]);

  // Detect when the active view's state diverges from current.
  const activeView = views.find((v) => v.id === activeId);
  const dirty = activeView
    ? serialize(activeView.state) !== serialize(currentState)
    : !isDefault(currentState);

  function persist(next: SavedView<S>[]) {
    setViews(next);
    try {
      window.localStorage.setItem(lsKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function setActive(id: string | null) {
    setActiveId(id);
    try {
      if (id) window.localStorage.setItem(lsActiveKey, id);
      else window.localStorage.removeItem(lsActiveKey);
    } catch {
      // ignore
    }
  }

  function save() {
    const name = draftName.trim();
    if (!name) return;
    const v: SavedView<S> = {
      id: `v-${Date.now()}`,
      name,
      state: currentState,
    };
    persist([...views, v]);
    setActive(v.id);
    setNaming(false);
    setDraftName("");
  }

  function remove(id: string) {
    persist(views.filter((v) => v.id !== id));
    if (activeId === id) setActive(null);
  }

  if (!hydrated) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-[10px] uppercase tracking-wider text-text-subtle mr-1">
        Views
      </span>
      <button
        type="button"
        onClick={() => {
          setActive(null);
          onReset();
        }}
        className={cn(
          "h-9 px-3 rounded-full text-xs font-medium border transition-colors",
          activeId === null && isDefault(currentState)
            ? "bg-text text-surface border-text"
            : "bg-surface text-text-muted border-border hover:bg-surface-muted/60 hover:text-text",
        )}
      >
        Default
      </button>
      {views.map((v) => {
        const active = activeId === v.id;
        return (
          <span
            key={v.id}
            className={cn(
              "inline-flex items-stretch rounded-full border overflow-hidden",
              active
                ? "border-text"
                : "border-border hover:border-border-strong",
            )}
          >
            <button
              type="button"
              onClick={() => {
                setActive(v.id);
                onApply(v.state);
              }}
              className={cn(
                "h-9 pl-3 pr-2 text-xs font-medium transition-colors",
                active
                  ? "bg-text text-surface"
                  : "bg-surface text-text-muted hover:bg-surface-muted/60 hover:text-text",
              )}
            >
              {v.name}
            </button>
            <button
              type="button"
              onClick={() => remove(v.id)}
              aria-label={`Delete view ${v.name}`}
              className={cn(
                "inline-flex items-center justify-center w-7 transition-colors",
                active
                  ? "bg-text text-surface/70 hover:text-surface"
                  : "bg-surface text-text-subtle hover:text-text hover:bg-surface-muted/60",
              )}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M3 3L9 9M9 3L3 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        );
      })}
      {dirty && !naming && (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className={cn(
            "h-9 px-3 rounded-full text-xs font-medium",
            "border border-dashed border-accent/50 text-accent",
            "hover:bg-accent-soft/50 transition-colors",
          )}
        >
          + Save current as view
        </button>
      )}
      {naming && (
        <span className="inline-flex items-stretch rounded-full border border-accent overflow-hidden">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setNaming(false);
                setDraftName("");
              }
            }}
            placeholder="View name"
            className={cn(
              "h-9 px-3 bg-surface text-xs text-text outline-none",
              "w-32",
            )}
          />
          <button
            type="button"
            onClick={save}
            disabled={!draftName.trim()}
            className={cn(
              "h-9 px-3 text-xs font-medium bg-accent text-surface",
              "hover:bg-accent/90 disabled:opacity-50 transition-colors",
            )}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setDraftName("");
            }}
            className="h-9 px-2 text-xs text-text-subtle hover:text-text bg-surface"
          >
            Cancel
          </button>
        </span>
      )}
    </div>
  );
}

// -------------------------------------------------- empty filter state

export function EmptyFilterState({
  title = "No matches",
  hint = "Try removing one of the active filters above.",
  onClear,
  className,
}: {
  title?: string;
  hint?: string;
  onClear: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center px-6 py-14",
        "rounded-lg border border-dashed border-border bg-surface-muted/30",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "mb-3 inline-flex items-center justify-center h-12 w-12 rounded-full",
          "bg-surface border border-border text-text-subtle",
        )}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle
            cx="9"
            cy="9"
            r="6"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M14 14L17 17"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M6 9L12 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="font-display text-base text-text">{title}</p>
      <p className="text-xs text-text-muted mt-1 max-w-sm">{hint}</p>
      <button
        type="button"
        onClick={onClear}
        className={cn(
          "mt-4 h-9 px-4 rounded-full text-xs font-medium",
          "bg-text text-surface hover:bg-text/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          "transition-colors",
        )}
      >
        Clear filters
      </button>
    </div>
  );
}
