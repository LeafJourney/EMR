"use client";

/**
 * StatusRibbon — EMR-953.
 *
 * Client-side status filter chips for the billing table. Replaces the old
 * server-roundtrip <Link> FilterTab strip in page.tsx.
 *
 * Features:
 *   • Each chip shows a count AND a visible word label.
 *   • Active chip lights up GREEN; inactive chips are muted.
 *   • The "Denied" chip stays RED even when inactive (always a warning cue).
 *   • Selecting a chip filters the already-loaded rows client-side (no
 *     server roundtrip) — the parent owns the active-status state.
 *   • Chips support HTML5 drag-to-reorder and add/remove (hide/show)
 *     categories; the layout (order + hidden) persists to localStorage.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export type StatusKey =
  | "all"
  | "draft"
  | "submitted"
  | "accepted"
  | "adjudicated"
  | "paid"
  | "partial"
  | "denied"
  | "closed";

const STATUS_LABEL: Record<StatusKey, string> = {
  all: "All",
  draft: "Draft",
  submitted: "Submitted",
  accepted: "Accepted",
  adjudicated: "Adjudicated",
  paid: "Paid",
  partial: "Partial",
  denied: "Denied",
  closed: "Closed",
};

// "all" is pinned first and never reorderable/removable.
const REORDERABLE: StatusKey[] = [
  "draft",
  "submitted",
  "accepted",
  "adjudicated",
  "paid",
  "partial",
  "denied",
  "closed",
];

const STORAGE_KEY = "ops.billing.statusRibbon.v1";

interface RibbonLayout {
  order: StatusKey[];
  hidden: StatusKey[];
}

function isStatusKey(v: unknown): v is StatusKey {
  return typeof v === "string" && v in STATUS_LABEL && v !== "all";
}

function defaultLayout(): RibbonLayout {
  return { order: [...REORDERABLE], hidden: [] };
}

function loadLayout(): RibbonLayout {
  if (typeof window === "undefined") return defaultLayout();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLayout();
    const parsed = JSON.parse(raw) as Partial<RibbonLayout>;
    const order = Array.isArray(parsed.order) ? parsed.order.filter(isStatusKey) : [];
    for (const k of REORDERABLE) if (!order.includes(k)) order.push(k);
    const hidden = Array.isArray(parsed.hidden) ? parsed.hidden.filter(isStatusKey) : [];
    return { order, hidden };
  } catch {
    return defaultLayout();
  }
}

export function StatusRibbon({
  active,
  counts,
  totalCount,
  onChange,
}: {
  active: StatusKey;
  counts: Record<string, number>;
  totalCount: number;
  onChange: (status: StatusKey) => void;
}) {
  const [layout, setLayout] = React.useState<RibbonLayout>(defaultLayout);
  const [hydrated, setHydrated] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    setLayout(loadLayout());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      /* storage unavailable; ignore */
    }
  }, [layout, hydrated]);

  const visible = React.useMemo(
    () => layout.order.filter((k) => !layout.hidden.includes(k)),
    [layout],
  );

  // ── drag-to-reorder ──
  const dragKey = React.useRef<StatusKey | null>(null);
  const [dragOver, setDragOver] = React.useState<StatusKey | null>(null);

  const onDragStart = (key: StatusKey) => (e: React.DragEvent) => {
    dragKey.current = key;
    try {
      e.dataTransfer.setData("text/plain", key);
      e.dataTransfer.effectAllowed = "move";
    } catch {
      /* mocked in tests */
    }
  };
  const onDragOver = (key: StatusKey) => (e: React.DragEvent) => {
    if (dragKey.current == null) return;
    e.preventDefault();
    if (dragOver !== key) setDragOver(key);
  };
  const onDrop = (key: StatusKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragKey.current;
    dragKey.current = null;
    setDragOver(null);
    if (from == null || from === key) return;
    setLayout((prev) => {
      const order = prev.order.filter((k) => k !== from);
      const idx = order.indexOf(key);
      order.splice(idx, 0, from);
      return { ...prev, order };
    });
  };
  const onDragEnd = () => {
    dragKey.current = null;
    setDragOver(null);
  };

  const removeChip = (key: StatusKey) => {
    setLayout((prev) =>
      prev.hidden.includes(key)
        ? prev
        : { ...prev, hidden: [...prev.hidden, key] },
    );
    if (active === key) onChange("all");
  };
  const addChip = (key: StatusKey) => {
    setLayout((prev) => ({ ...prev, hidden: prev.hidden.filter((k) => k !== key) }));
  };
  const resetLayout = () => setLayout(defaultLayout());

  const removable = layout.order.filter((k) => layout.hidden.includes(k));

  return (
    <div className="mb-6 border-b border-border pb-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Pinned "All" chip */}
        <Chip
          label={STATUS_LABEL.all}
          count={totalCount}
          active={active === "all"}
          onClick={() => onChange("all")}
        />

        {visible.map((key) => (
          <div
            key={key}
            draggable
            onDragStart={onDragStart(key)}
            onDragOver={onDragOver(key)}
            onDrop={onDrop(key)}
            onDragEnd={onDragEnd}
            className={cn(
              "rounded-full",
              dragOver === key && "ring-2 ring-accent/50",
            )}
          >
            <Chip
              label={STATUS_LABEL[key]}
              count={counts[key] ?? 0}
              active={active === key}
              danger={key === "denied"}
              draggable
              onClick={() => onChange(key)}
              onRemove={() => removeChip(key)}
            />
          </div>
        ))}

        {/* Add / manage categories */}
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted hover:text-text px-2.5 py-1 rounded-md border border-border bg-surface hover:bg-surface-muted transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Categories
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" aria-hidden="true" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-surface-raised shadow-lg p-2"
              >
                <p className="text-[10px] uppercase tracking-wider text-text-subtle px-2 py-1">
                  Show categories
                </p>
                {REORDERABLE.map((key) => {
                  const shown = !layout.hidden.includes(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-muted cursor-pointer text-sm text-text"
                    >
                      <input
                        type="checkbox"
                        checked={shown}
                        onChange={() => (shown ? removeChip(key) : addChip(key))}
                        className="accent-[color:var(--accent)]"
                      />
                      {STATUS_LABEL[key]}
                      <span className="ml-auto text-[10px] tabular-nums text-text-subtle">
                        {counts[key] ?? 0}
                      </span>
                    </label>
                  );
                })}
                <div className="border-t border-border mt-1 pt-1">
                  <button
                    type="button"
                    onClick={resetLayout}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-surface-muted text-xs text-text-muted"
                  >
                    Reset to default
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick re-add row for removed chips */}
      {removable.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[10px] uppercase tracking-wider text-text-subtle">
            Hidden:
          </span>
          {removable.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => addChip(key)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-dashed border-border text-text-subtle hover:text-text hover:border-accent transition-colors"
            >
              + {STATUS_LABEL[key]}
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-text-subtle mt-2">
        Drag chips to reorder · click the × to hide a category · filtering is instant
      </p>
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  danger = false,
  draggable = false,
  onClick,
  onRemove,
}: {
  label: string;
  count: number;
  active: boolean;
  danger?: boolean;
  draggable?: boolean;
  onClick: () => void;
  onRemove?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-full text-sm font-medium transition-all border select-none",
        draggable && "cursor-grab active:cursor-grabbing",
        active
          ? // GREEN when active
            "bg-success text-white border-success shadow-sm"
          : danger
            ? // Denied stays RED even when inactive
              "bg-danger/10 text-danger border-danger/40 hover:bg-danger/15"
            : "bg-surface-muted text-text-muted border-border hover:bg-surface-raised",
      )}
    >
      <button type="button" onClick={onClick} className="inline-flex items-center gap-2">
        <span>{label}</span>
        <span
          className={cn(
            "text-[10px] tabular-nums px-1.5 py-0.5 rounded-full",
            active
              ? "bg-white/25 text-white"
              : danger
                ? "bg-danger/15 text-danger"
                : "bg-surface text-text-subtle",
          )}
        >
          {count}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Hide ${label}`}
          className={cn(
            "rounded-full -mr-0.5 leading-none transition-opacity opacity-50 hover:opacity-100",
            active ? "text-white" : danger ? "text-danger" : "text-text-subtle",
          )}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
