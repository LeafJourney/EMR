"use client";

/**
 * SortableList — lightweight drag-and-drop primitive for LeafJourney EMR.
 *
 * Goal: Monday.com / Trello / Linear-tier reorderable lists everywhere we
 * have one. Zero new deps — pure React + the HTML5 drag-and-drop API +
 * framer-motion (already in the bundle) for the lift animation.
 *
 * Design notes
 * ────────────
 *   • Drag handle is opt-in. The render prop receives `dragHandleProps`
 *     that the caller spreads onto whichever element should grab the row.
 *     If you spread it onto the entire row, the whole row is draggable.
 *     If you spread it onto a tiny grip icon, the rest of the row stays
 *     interactive (links, buttons, etc).
 *   • Keyboard reorder, Monday-style:
 *         Space (on handle)      → pick up
 *         ↑ / ↓                  → move
 *         Space / Enter          → drop
 *         Esc                    → cancel and restore original index
 *   • `prefers-reduced-motion`: no scale / shadow lift, instant snap.
 *   • The component is **uncontrolled with respect to drag state** but
 *     **controlled with respect to data**: callers own the `items`
 *     array and respond to `onReorder(from, to)` by updating their own
 *     state (optionally persisting). The primitive never owns truth.
 *
 * Accessibility
 * ─────────────
 *   • Each row exposes `aria-grabbed`/`aria-roledescription` while in
 *     a keyboard reorder, mirroring W3C drag-and-drop guidance.
 *   • A polite live region announces "Picked up item N of M", "Moved to
 *     position K of M", "Dropped at position K", "Cancelled" so screen
 *     reader users get feedback for an otherwise-visual interaction.
 *
 * Why not dnd-kit / react-beautiful-dnd?
 *   We need ~150 lines, not a 90KB dependency. The HTML5 DnD API is
 *   crusty but well-supported and good enough for vertical lists. If
 *   we ever need multi-axis grids or virtualization we'll revisit.
 */

import * as React from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type MotionProps,
} from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { EASE_PREMIUM, DURATION } from "@/lib/ui/motion";

// ───────────────────────────────────────── Public types

/**
 * Props the primitive hands back to the caller's `renderItem`. Spread
 * `dragHandleProps` onto the element that should initiate the drag —
 * commonly a small grip icon, but spreading onto the row root works too.
 */
export interface DragHandleProps {
  /** Mark the element as the drag source for HTML5 DnD. */
  draggable: true;
  /** Required for screen reader / keyboard discoverability. */
  role: "button";
  tabIndex: 0;
  "aria-label": string;
  "aria-grabbed": boolean;
  "aria-roledescription": "sortable";
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  /** Cursor + subtle hover affordance. Tailwind class string. */
  className: string;
  /** So we can refocus the handle after a keyboard reorder. */
  "data-sortable-handle-index": number;
}

export interface SortableRenderArgs {
  /** Spread onto the element that should be the drag source. */
  dragHandleProps: DragHandleProps;
  /** True while this row is the one being dragged (mouse or keyboard). */
  isDragging: boolean;
  /** Index in the *current* items array. */
  index: number;
}

export interface SortableListProps<T> {
  /** Source-of-truth list. The caller owns mutations. */
  items: readonly T[];
  /** Stable key extractor — must be unique per item. */
  getKey: (item: T, index: number) => string;
  /** Called after a successful drop / keyboard drop. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Renders each row. Spread `dragHandleProps` somewhere inside. */
  renderItem: (item: T, args: SortableRenderArgs) => React.ReactNode;
  /** Optional label for the list as a whole (announced to AT). */
  ariaLabel?: string;
  /** Optional className for the outer container. */
  className?: string;
  /** Disable drag for the entire list (e.g. while saving). */
  disabled?: boolean;
}

// ───────────────────────────────────────── Component

export function SortableList<T>({
  items,
  getKey,
  onReorder,
  renderItem,
  ariaLabel,
  className,
  disabled = false,
}: SortableListProps<T>) {
  const reduce = useReducedMotion() ?? false;

  // The index currently being dragged (mouse or keyboard).
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  // The index hovered as a potential drop target (mouse drag).
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  // Keyboard-only: the in-flight target index while moving with arrow keys.
  const [keyboardTarget, setKeyboardTarget] = React.useState<number | null>(
    null,
  );
  // Polite live-region announcement.
  const [announcement, setAnnouncement] = React.useState<string>("");

  const containerRef = React.useRef<HTMLUListElement | null>(null);

  // Stash these so handlers can read the latest without re-binding the
  // window listener on every render.
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const announce = React.useCallback((msg: string) => {
    setAnnouncement(""); // toggle to retrigger SR readout
    // The next paint will see the new value. Using rAF instead of setTimeout
    // so we don't depend on a flaky timer cadence.
    requestAnimationFrame(() => setAnnouncement(msg));
  }, []);

  // ───── Mouse / HTML5 DnD ─────

  const startMouseDrag = (e: React.DragEvent, index: number) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    setDragIndex(index);
    setOverIndex(index);
    // Firefox requires *some* data for the drag to actually start.
    try {
      e.dataTransfer.setData("text/plain", String(index));
      e.dataTransfer.effectAllowed = "move";
    } catch {
      // Some test environments mock dataTransfer; failing here would
      // wedge the drag so we swallow.
    }
  };

  const endMouseDrag = () => {
    if (dragIndex == null) return;
    const from = dragIndex;
    const to = overIndex ?? dragIndex;
    setDragIndex(null);
    setOverIndex(null);
    if (from !== to && to >= 0 && to < itemsRef.current.length) {
      onReorder(from, to);
      announce(`Moved to position ${to + 1} of ${itemsRef.current.length}`);
    }
  };

  const handleRowDragOver = (e: React.DragEvent, index: number) => {
    if (dragIndex == null) return;
    e.preventDefault(); // allow drop
    if (overIndex !== index) setOverIndex(index);
  };

  // ───── Keyboard reorder ─────

  const startKeyboardDrag = (index: number) => {
    if (disabled) return;
    setDragIndex(index);
    setKeyboardTarget(index);
    announce(`Picked up item ${index + 1} of ${itemsRef.current.length}`);
  };

  const moveKeyboardDrag = (delta: number) => {
    if (dragIndex == null || keyboardTarget == null) return;
    const next = Math.max(
      0,
      Math.min(itemsRef.current.length - 1, keyboardTarget + delta),
    );
    if (next === keyboardTarget) return;
    setKeyboardTarget(next);
    announce(`Moved to position ${next + 1} of ${itemsRef.current.length}`);
  };

  const dropKeyboardDrag = () => {
    if (dragIndex == null || keyboardTarget == null) return;
    const from = dragIndex;
    const to = keyboardTarget;
    setDragIndex(null);
    setKeyboardTarget(null);
    if (from !== to) {
      onReorder(from, to);
      announce(`Dropped at position ${to + 1} of ${itemsRef.current.length}`);
    } else {
      announce("Dropped — no change");
    }
    // Try to refocus the handle at the new position so a chain of moves
    // feels continuous to keyboard users.
    requestAnimationFrame(() => {
      const handle = containerRef.current?.querySelector<HTMLElement>(
        `[data-sortable-handle-index="${to}"]`,
      );
      handle?.focus();
    });
  };

  const cancelKeyboardDrag = () => {
    if (dragIndex == null) return;
    setDragIndex(null);
    setKeyboardTarget(null);
    announce("Reorder cancelled");
  };

  const handleHandleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (disabled) return;
    const isPickUpKey = e.key === " " || e.key === "Enter";

    // Not currently dragging → Space/Enter picks up.
    if (dragIndex == null) {
      if (isPickUpKey) {
        e.preventDefault();
        startKeyboardDrag(index);
      }
      return;
    }

    // Currently dragging this row → handle nav keys.
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveKeyboardDrag(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveKeyboardDrag(-1);
    } else if (isPickUpKey) {
      e.preventDefault();
      dropKeyboardDrag();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelKeyboardDrag();
    } else if (e.key === "Tab") {
      // Tab while picked up → treat as drop so focus can escape cleanly.
      dropKeyboardDrag();
    }
  };

  // While keyboard-dragging, the "displayed" order needs to reflect
  // the in-flight target so the user sees the row move under their
  // fingers. For mouse DnD the source row stays in place and we draw
  // a drop-target indicator instead.
  const displayItems = React.useMemo(() => {
    if (dragIndex == null || keyboardTarget == null) return items;
    if (dragIndex === keyboardTarget) return items;
    const next = items.slice();
    const [moved] = next.splice(dragIndex, 1);
    if (moved !== undefined) next.splice(keyboardTarget, 0, moved);
    return next;
  }, [items, dragIndex, keyboardTarget]);

  // Map the displayed index back to the underlying source index so
  // mouse-DnD handlers still pass real indices to onReorder. For mouse
  // drag we don't reshuffle displayItems so the mapping is identity.
  const displayToSource = (displayIdx: number): number => {
    if (dragIndex == null || keyboardTarget == null) return displayIdx;
    if (dragIndex === keyboardTarget) return displayIdx;
    // We rebuilt the array: the source item at `keyboardTarget` is
    // the one originally at `dragIndex`. Everything else stays in
    // relative order so we can derive: shift items between min/max.
    if (displayIdx === keyboardTarget) return dragIndex;
    const lo = Math.min(dragIndex, keyboardTarget);
    const hi = Math.max(dragIndex, keyboardTarget);
    if (displayIdx < lo || displayIdx > hi) return displayIdx;
    return dragIndex < keyboardTarget ? displayIdx + 1 : displayIdx - 1;
  };

  const handleClassBase =
    "inline-flex items-center justify-center select-none " +
    "rounded text-text-subtle hover:text-text " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 " +
    "cursor-grab active:cursor-grabbing aria-grabbed:cursor-grabbing " +
    "transition-colors";

  return (
    <ul
      ref={containerRef}
      role="list"
      aria-label={ariaLabel ?? "Sortable list"}
      className={cn("space-y-1", className)}
    >
      {/* Polite live region for screen reader announcements. */}
      <li className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </li>

      <AnimatePresence initial={false}>
        {displayItems.map((item, displayIdx) => {
          const sourceIdx = displayToSource(displayIdx);
          const key = getKey(item, sourceIdx);
          const isBeingDragged = dragIndex === sourceIdx;
          const isMouseDropTarget =
            dragIndex != null &&
            keyboardTarget == null &&
            overIndex === displayIdx &&
            dragIndex !== displayIdx;

          const dragHandleProps: DragHandleProps = {
            draggable: true,
            role: "button",
            tabIndex: 0,
            "aria-label":
              isBeingDragged && keyboardTarget != null
                ? `Item ${displayIdx + 1} of ${displayItems.length}, picked up. Use arrow keys to move, Space to drop, Escape to cancel.`
                : `Drag to reorder, item ${displayIdx + 1} of ${displayItems.length}. Press Space to pick up.`,
            "aria-grabbed": isBeingDragged,
            "aria-roledescription": "sortable",
            onDragStart: (e) => startMouseDrag(e, displayIdx),
            onDragEnd: endMouseDrag,
            onKeyDown: (e) => handleHandleKeyDown(e, sourceIdx),
            className: handleClassBase,
            "data-sortable-handle-index": sourceIdx,
          };

          // Motion: subtle elevation when this row is being dragged.
          // Reduced motion → no transform / no scale, just an outline.
          const motionProps: MotionProps = reduce
            ? {
                initial: false,
                animate: { opacity: isBeingDragged ? 0.9 : 1 },
                transition: { duration: 0 },
              }
            : {
                layout: true,
                initial: false,
                animate: {
                  scale: isBeingDragged ? 1.015 : 1,
                  boxShadow: isBeingDragged
                    ? "0 8px 24px -8px rgba(0,0,0,0.18), 0 2px 4px -2px rgba(0,0,0,0.06)"
                    : "0 0 0 rgba(0,0,0,0)",
                  zIndex: isBeingDragged ? 5 : 1,
                  opacity: isBeingDragged && keyboardTarget == null ? 0.85 : 1,
                },
                transition: { duration: DURATION.quick, ease: EASE_PREMIUM },
              };

          return (
            <motion.li
              key={key}
              {...motionProps}
              onDragOver={(e) => handleRowDragOver(e, displayIdx)}
              onDrop={(e) => {
                if (dragIndex == null) return;
                e.preventDefault();
                // endMouseDrag will consume overIndex.
              }}
              className={cn(
                "relative list-none",
                isMouseDropTarget &&
                  "before:absolute before:left-0 before:right-0 before:-top-0.5 before:h-0.5 before:bg-accent before:rounded-full",
              )}
              aria-roledescription="sortable"
            >
              {renderItem(item, {
                dragHandleProps,
                isDragging: isBeingDragged,
                index: displayIdx,
              })}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

// ───────────────────────────────────────── KanbanBoard
//
// Optional second primitive: a horizontally-arranged set of SortableList
// columns with cross-column moves wired through one callback. The
// internal move state is kept here so a card can transition out of one
// column and into another in one user gesture (mouse) — we route both
// drag events through column-level dataTransfer payloads.

export interface KanbanColumn<T> {
  id: string;
  title: string;
  items: readonly T[];
}

export interface KanbanBoardProps<T> {
  columns: readonly KanbanColumn<T>[];
  /** Card key extractor (must be globally unique across columns). */
  getKey: (item: T) => string;
  /** Render each card; spread `dragHandleProps` for an opt-in drag handle. */
  renderCard: (item: T, args: SortableRenderArgs) => React.ReactNode;
  /** Optional column header renderer. */
  renderColumnHeader?: (column: KanbanColumn<T>) => React.ReactNode;
  /**
   * Called after a card moves. `fromColumnId === toColumnId` for a
   * within-column reorder; otherwise it's a cross-column move and the
   * caller is responsible for splicing the card out of one column's
   * state and into the other.
   */
  onMoveCard: (args: {
    fromColumnId: string;
    toColumnId: string;
    fromIndex: number;
    toIndex: number;
  }) => void;
  className?: string;
  ariaLabel?: string;
}

const KANBAN_DRAG_MIME = "application/x-leafjourney-kanban";

interface KanbanDragPayload {
  columnId: string;
  index: number;
}

export function KanbanBoard<T>({
  columns,
  getKey,
  renderCard,
  renderColumnHeader,
  onMoveCard,
  className,
  ariaLabel,
}: KanbanBoardProps<T>) {
  const reduce = useReducedMotion() ?? false;

  // Stash the in-flight cross-column payload so column-level
  // dragOver / drop handlers can know what's being moved without
  // relying on dataTransfer.getData (which is empty during dragover
  // for security reasons in most browsers).
  const dragRef = React.useRef<KanbanDragPayload | null>(null);

  const handleColumnDragOver = (e: React.DragEvent) => {
    if (!dragRef.current) return;
    if (e.dataTransfer.types.includes(KANBAN_DRAG_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleColumnDrop = (e: React.DragEvent, toColumnId: string) => {
    const payload = dragRef.current;
    if (!payload) return;
    e.preventDefault();
    // Drop at end of column when no specific row was hovered.
    const toColumn = columns.find((c) => c.id === toColumnId);
    const toIndex = toColumn ? toColumn.items.length : 0;
    if (payload.columnId !== toColumnId) {
      onMoveCard({
        fromColumnId: payload.columnId,
        toColumnId,
        fromIndex: payload.index,
        toIndex,
      });
    }
    dragRef.current = null;
  };

  return (
    <div
      role="region"
      aria-label={ariaLabel ?? "Kanban board"}
      className={cn(
        "flex gap-4 overflow-x-auto pb-2 snap-x scrollbar-thin",
        className,
      )}
    >
      {columns.map((column) => (
        <div
          key={column.id}
          className="flex-shrink-0 w-72 snap-start rounded-lg border border-border bg-surface-muted/40 p-3"
          onDragOver={handleColumnDragOver}
          onDrop={(e) => handleColumnDrop(e, column.id)}
        >
          {renderColumnHeader ? (
            renderColumnHeader(column)
          ) : (
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-medium">
                {column.title}
              </p>
              <span className="text-[11px] text-text-subtle tabular-nums">
                {column.items.length}
              </span>
            </div>
          )}

          <SortableList
            items={column.items}
            getKey={(item) => getKey(item)}
            ariaLabel={`${column.title} column`}
            onReorder={(from, to) =>
              onMoveCard({
                fromColumnId: column.id,
                toColumnId: column.id,
                fromIndex: from,
                toIndex: to,
              })
            }
            renderItem={(item, args) => {
              // Patch the drag handle so cross-column DnD has the column
              // context it needs. We wrap onDragStart to inject the
              // payload and dataTransfer MIME.
              const originalOnDragStart = args.dragHandleProps.onDragStart;
              const onDragStart = (e: React.DragEvent) => {
                dragRef.current = { columnId: column.id, index: args.index };
                try {
                  e.dataTransfer.setData(KANBAN_DRAG_MIME, column.id);
                } catch {
                  // ignore — test harnesses sometimes mock dataTransfer.
                }
                originalOnDragStart(e);
              };
              const patchedHandle: DragHandleProps = {
                ...args.dragHandleProps,
                onDragStart,
              };
              return renderCard(item, {
                ...args,
                dragHandleProps: patchedHandle,
              });
            }}
          />
        </div>
      ))}
      {/* Reduce-motion hint kept silent — handled by SortableList per row. */}
      {reduce ? null : null}
    </div>
  );
}

// ───────────────────────────────────────── Convenience helpers

/**
 * Pure helper to move an item within an immutable list. Useful for
 * `onReorder` consumers that just want `setItems(reorder(items, f, t))`.
 */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to) return list.slice();
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return next;
  next.splice(to, 0, moved);
  return next;
}
