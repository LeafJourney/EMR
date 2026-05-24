"use client";

/**
 * BulkActionBar — sticky, bottom-anchored multi-select action bar.
 *
 * Linear / Notion / Gmail / GitHub all share the same idiom: select one or
 * more rows in a list, then a contextual action bar slides up from the
 * bottom showing "{N} selected" alongside the bulk operations available
 * for that surface. Dismissing or completing an action collapses it back
 * out of view.
 *
 * This primitive is intentionally tiny — it only owns visibility, the
 * "{N} selected" announcement, and the "Clear selection" affordance.
 * Surface-specific actions are passed in as either `children` or via the
 * `actions` prop (preferred for type-safety).
 *
 * Visibility:
 *  - Renders nothing when `count === 0`.
 *  - When `count >= 1`, slides up from the bottom with the same spring
 *    used by our modal entrance presets, so the motion language stays
 *    cohesive with the rest of the app (PR #454 — `lib/ui/motion.ts`).
 *  - Honors prefers-reduced-motion (no transform, just fade).
 *
 * Accessibility:
 *  - The selection count is announced via `aria-live="polite"` so screen
 *    readers learn when the user has selected something without losing
 *    focus context.
 *  - Each action button is a real <button> with a label; destructive
 *    actions take an `isDestructive` flag so the renderer can tint them.
 *  - The bar itself is `role="region"` with an `aria-label` that names
 *    it so a SR user can jump to it via landmarks.
 *
 * Layout notes:
 *  - Position: `fixed` to the viewport bottom (the bar is global within
 *    the page chrome, not scoped to the table). Pinned 16px from the
 *    bottom on >= sm, full-width on mobile.
 *  - z-index: kept *below* the toast stack (50) so toasts produced by
 *    bulk actions appear above the bar.
 *  - The bar is wrapped in a non-interactive `pointer-events-none`
 *    container so the surrounding page remains clickable; only the
 *    inner card opts back in via `pointer-events-auto`.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { EASE_PREMIUM, DURATION, SPRING_MODAL } from "@/lib/ui/motion";

// ---------------------------------------------------------------- types

export interface BulkAction {
  /** Stable key for React reconciliation. */
  key: string;
  /** Visible label. Keep it terse — "Tag", "Archive", "Export to CSV". */
  label: string;
  /** Optional leading icon. */
  icon?: React.ReactNode;
  /** Click handler — receives the same selection the bar is showing,
   *  but the caller already has the Set so the handler is parameterless. */
  onClick: () => void | Promise<void>;
  /** When true, the button is rendered in a destructive tint and the
   *  caller is expected to gate the click with a confirm dialog. */
  isDestructive?: boolean;
  /** Disable the button (e.g. while a bulk op is in flight). */
  disabled?: boolean;
  /** When the action is in progress, render a spinner glyph and disable. */
  isPending?: boolean;
  /** Override the title attribute / tooltip text. */
  title?: string;
}

export interface BulkActionBarProps {
  /** Number of currently-selected rows. <= 0 hides the bar. */
  count: number;
  /** Called when the trailing "Clear selection" link is clicked. */
  onClear: () => void;
  /** Optional surface-named label, e.g. "patients". Used in the count
   *  display: "3 patients selected" vs "3 selected". */
  itemNoun?: string;
  /** Pluralisation override. Defaults to noun + "s". */
  itemNounPlural?: string;
  /** Typed action descriptors. Renders before any `children`. */
  actions?: BulkAction[];
  /** Optional escape hatch for fully custom action UI. Rendered after
   *  any `actions[]`. */
  children?: React.ReactNode;
  /** Aria label on the bar's landmark region. Defaults to "Bulk actions". */
  ariaLabel?: string;
  /** Override the trailing clear-link copy. */
  clearLabel?: string;
  className?: string;
}

// ------------------------------------------------------------ small icon

function CloseGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 3l6 6M9 3l-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle
        cx="6"
        cy="6"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeOpacity="0.25"
        fill="none"
      />
      <path
        d="M10.5 6a4.5 4.5 0 0 0-4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// -------------------------------------------------------------- helpers

function formatCount(count: number, noun?: string, nounPlural?: string): string {
  if (!noun) return `${count} selected`;
  const plural = nounPlural ?? `${noun}s`;
  return `${count} ${count === 1 ? noun : plural} selected`;
}

// -------------------------------------------------------------- variants

function barEntrance(reduce: boolean) {
  if (reduce) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: DURATION.quick, ease: EASE_PREMIUM },
    } as const;
  }
  return {
    initial: { opacity: 0, y: 24, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 12, scale: 0.99 },
    transition: SPRING_MODAL,
  } as const;
}

// ---------------------------------------------------------- BulkActionBar

export function BulkActionBar({
  count,
  onClear,
  itemNoun,
  itemNounPlural,
  actions,
  children,
  ariaLabel = "Bulk actions",
  clearLabel = "Clear selection",
  className,
}: BulkActionBarProps) {
  const reduce = useReducedMotion() ?? false;

  // Track the "live" count we should announce. We deliberately wait for
  // the bar to be visible to swap the value so the screen reader doesn't
  // hear "0 selected" as the bar exits.
  const lastVisibleCount = React.useRef(count);
  if (count > 0) lastVisibleCount.current = count;

  return (
    // Outer container: pinned to the viewport bottom, never blocks clicks
    // around the card itself. Inner card opts back into pointer events.
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center",
        "px-3 sm:px-6 pb-3 sm:pb-5",
      )}
      aria-hidden={count === 0 ? "true" : undefined}
    >
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            key="bulk-bar"
            role="region"
            aria-label={ariaLabel}
            className={cn(
              "pointer-events-auto",
              "w-full sm:w-auto sm:max-w-[min(960px,calc(100vw-3rem))]",
              "rounded-2xl border border-border/70 bg-surface/95 backdrop-blur-md",
              "shadow-[0_18px_50px_-12px_rgba(15,23,42,0.35)]",
              "ring-1 ring-black/5",
              "px-3 sm:px-4 py-2.5",
              "flex items-center gap-2 sm:gap-3 flex-wrap",
              className,
            )}
            {...barEntrance(reduce)}
          >
            {/* Selection count — announced politely so SR users know
                exactly how many rows are currently affected. */}
            <div
              aria-live="polite"
              aria-atomic="true"
              className={cn(
                "inline-flex items-center gap-2 pl-1 pr-2 sm:pr-3",
                "border-r border-border/60",
                "min-w-[6.5rem]",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 min-w-[1.5rem] items-center justify-center",
                  "rounded-full bg-accent/15 px-1.5",
                  "text-[11px] font-semibold tabular-nums text-accent",
                )}
              >
                {lastVisibleCount.current}
              </span>
              <span className="text-sm font-medium text-text">
                {formatCount(lastVisibleCount.current, itemNoun, itemNounPlural)
                  .replace(/^\d+\s/, "")}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap min-w-0">
              {actions?.map((a) => {
                const disabled = a.disabled || a.isPending;
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => {
                      if (!disabled) void a.onClick();
                    }}
                    disabled={disabled}
                    title={a.title ?? a.label}
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      "h-8 px-3 rounded-lg",
                      "text-xs font-medium",
                      "transition-colors duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                      a.isDestructive
                        ? "text-danger hover:bg-danger/10 active:bg-danger/15"
                        : "text-text hover:bg-surface-muted active:bg-surface-muted/80",
                      disabled && "opacity-50 cursor-not-allowed pointer-events-none",
                    )}
                  >
                    {a.isPending ? (
                      <Spinner />
                    ) : a.icon ? (
                      <span className="shrink-0 opacity-80">{a.icon}</span>
                    ) : null}
                    <span className="truncate">{a.label}</span>
                  </button>
                );
              })}
              {children}
            </div>

            {/* Trailing clear-selection link */}
            <button
              type="button"
              onClick={onClear}
              className={cn(
                "ml-auto inline-flex items-center gap-1.5",
                "h-8 px-2.5 rounded-lg",
                "text-xs font-medium text-text-muted",
                "hover:text-text hover:bg-surface-muted",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              )}
              aria-label={clearLabel}
            >
              <CloseGlyph />
              <span className="hidden sm:inline">{clearLabel}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------- selection helpers

/**
 * `useBulkSelection` — small ergonomic hook for working with a Set<string>
 * of row keys. Pairs with `<DataTable selection={...}>` (PR #460) and the
 * `<BulkActionBar>` primitive above. Co-located here so any surface that
 * adopts the bar gets the helper for free, with no extra import.
 *
 *   const sel = useBulkSelection<string>();
 *   <DataTable selection={{ selected: sel.selected, onChange: sel.set, rowKey: r => r.id }} />
 *   <BulkActionBar count={sel.size} onClear={sel.clear} ... />
 */
export function useBulkSelection<K extends string = string>() {
  const [selected, setSelected] = React.useState<Set<K>>(new Set());

  const set = React.useCallback((next: Set<K>) => setSelected(next), []);

  const clear = React.useCallback(() => setSelected(new Set()), []);

  const toggle = React.useCallback((key: K) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const has = React.useCallback(
    (key: K) => selected.has(key),
    [selected],
  );

  /**
   * Replace the entire visible-keys span. Pass the full list of currently
   * visible row keys to support ⌘/Ctrl+A (select-all-visible).
   *
   *   if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
   *     e.preventDefault();
   *     sel.setAllVisible(visibleKeys);
   *   }
   */
  const setAllVisible = React.useCallback(
    (visibleKeys: K[]) => setSelected(new Set(visibleKeys)),
    [],
  );

  /**
   * Anchor-based range select for Shift+Click. The caller passes:
   *  - `keysInOrder`: the visible row keys in their current display order
   *  - `from`: the previously-clicked key (or null if no anchor yet)
   *  - `to`:   the just-clicked key
   *
   * Returns the new selection Set so the caller can also persist a fresh
   * anchor (commonly the `to` key).
   */
  const selectRange = React.useCallback(
    (keysInOrder: K[], from: K | null, to: K) => {
      if (!from) {
        // No anchor yet — fall back to a single-row toggle so the first
        // Shift+Click just selects the row, mirroring Linear's behavior.
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(to)) next.delete(to);
          else next.add(to);
          return next;
        });
        return;
      }
      const a = keysInOrder.indexOf(from);
      const b = keysInOrder.indexOf(to);
      if (a < 0 || b < 0) return;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(keysInOrder[i]);
        return next;
      });
    },
    [],
  );

  return {
    selected,
    set,
    clear,
    toggle,
    has,
    setAllVisible,
    selectRange,
    size: selected.size,
    /** Snapshot of currently-selected keys as an array. */
    asArray: React.useMemo(() => Array.from(selected), [selected]),
  };
}
