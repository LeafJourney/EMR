"use client";

// DataTable — the lightweight, Monday/Linear-tier table primitive that
// every operator, admin, and clinician roster surface should adopt.
//
// Design goals (kept bespoke — explicitly no @tanstack/react-table):
//
//   - One generic <DataTable<Row>> with full TypeScript inference on
//     every column's `cell(row)`.
//   - Sticky header that floats over a scroll container (`position:
//     sticky; top: 0`).
//   - Tri-state sort on click: asc → desc → cleared (back to the
//     incoming row order). Arrow indicator is ▲ / ▼ at 60% opacity so it
//     never dominates the header text. Pass `sortFn` for custom
//     compares; otherwise the column's `key` is read off the row and
//     compared with `localeCompare` (strings) or numeric subtraction.
//   - Optional row selection. Controlled via
//     `{ selected: Set<string>, onChange, rowKey }`. Renders a checkbox
//     column with header tri-state for "select all visible".
//   - Density toggle (`comfortable` default | `dense`). Apple-iOS
//     `comfortable` = generous row padding (44px tap target on touch),
//     subtle dividers; `dense` halves vertical padding for power users.
//   - Loading state via the `isLoading` flag — renders skeleton rows
//     sized to the column set (uses the existing <Skeleton> primitive
//     from PR #456 so the parchment shimmer matches the rest of the
//     app).
//   - Empty state slot. If `emptyState` is supplied (typically the
//     existing <EmptyState> from PR #457) it renders inside a single
//     full-width row when `rows.length === 0`.
//   - Optional row click (`onRowClick(row)`). When set, every row gets
//     `cursor: pointer` + a subtle `hover:bg-surface-muted/50` overlay.
//   - Keyboard nav: arrow up/down moves the row focus ring, Enter
//     toggles selection when a `selection` prop is set, Space toggles
//     selection on the focused row. Focus is intrinsic to the table
//     (tab in once) — we don't trap, we just route arrows internally.
//   - Numerics get `tabular-nums` automatically when `align: "right"`.
//
// The primitive ships zero filtering / pagination / virtualisation —
// the caller is expected to slice/filter upstream (the operator filter
// chrome from PR #446 sits above us). One job, done well.

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useContextMenu,
  type ContextMenuItem,
} from "@/components/ui/context-menu";

// ----------------------------------------------------------------- types

export type DataTableAlign = "left" | "center" | "right";

export type DataTableDensity = "comfortable" | "dense";

export interface ColumnDef<Row> {
  /** Stable column id. Also used as the field accessor on `row` when no
   *  custom `cell` or `sortFn` is supplied. Pass a string that's safe to
   *  use as a React key. */
  key: string;
  /** Visible header text. Override with `headerCell` for chrome. */
  label: string;
  /** When true, header is clickable to tri-state sort the column. */
  sortable?: boolean;
  /** Custom comparator. Receives the two row objects in the table's
   *  current order; should return < 0 / 0 / > 0 like Array.prototype.sort. */
  sortFn?: (a: Row, b: Row) => number;
  /** Optional fixed width (CSS value). Useful for checkbox / actions cols. */
  width?: string;
  /** Cell + header alignment. Defaults to "left" — "right" auto-enables
   *  `tabular-nums` for clean numeric columns. */
  align?: DataTableAlign;
  /** Cell renderer. Defaults to `(row) => row[key]`. */
  cell?: (row: Row, ctx: { index: number }) => React.ReactNode;
  /** Header renderer override. The default already provides sort UI. */
  headerCell?: () => React.ReactNode;
  /** Hide on mobile (<= sm). Useful for secondary numeric columns. */
  hideOnMobile?: boolean;
}

export interface DataTableSelection<Row> {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  rowKey: (row: Row) => string;
}

export interface DataTableProps<Row> {
  columns: ColumnDef<Row>[];
  rows: Row[];
  /** Stable per-row key. Defaults to `selection.rowKey` if supplied,
   *  otherwise to the row's index — pass an explicit `rowKey` for stable
   *  React reconciliation on filtered lists. */
  rowKey?: (row: Row, index: number) => string;
  selection?: DataTableSelection<Row>;
  density?: DataTableDensity;
  /** Show a density toggle in the upper-right of the table header. */
  showDensityToggle?: boolean;
  /** Callback when a whole row is clicked. Triggers `cursor-pointer`. */
  onRowClick?: (row: Row, index: number) => void;
  isLoading?: boolean;
  /** Number of skeleton rows to render while loading. */
  loadingRowCount?: number;
  /** Slot for an empty-state element (use `<EmptyState>` from PR #457). */
  emptyState?: React.ReactNode;
  /** Optional caption rendered above the table, after the toolbar. */
  caption?: React.ReactNode;
  /** Toolbar slot — rendered above the table, e.g. filter chips. */
  toolbar?: React.ReactNode;
  /** Sticky header — defaults to true. Disable for short tables nested
   *  inside other scroll containers. */
  stickyHeader?: boolean;
  /** Max height for the scroll container (e.g. "60vh"). When set, the
   *  table scrolls internally and the header sticks to its top. */
  maxHeight?: string;
  /** Aria label for screen readers. Required when caption is absent. */
  ariaLabel?: string;
  className?: string;
  /** Extra row className resolver — useful for highlighting alerts. */
  rowClassName?: (row: Row, index: number) => string | undefined;
  /** Per-row right-click / long-press menu items (Monday/Linear-tier).
   *  Return `null` or an empty array to skip the menu on a given row. */
  contextMenuItems?: (row: Row, index: number) => ContextMenuItem[] | null;
}

interface SortState {
  key: string;
  dir: "asc" | "desc";
}

// ----------------------------------------------------------- comparators

function defaultCompare<Row>(key: keyof Row & string, a: Row, b: Row): number {
  const av = (a as Record<string, unknown>)[key];
  const bv = (b as Record<string, unknown>)[key];
  if (av == null && bv == null) return 0;
  if (av == null) return -1;
  if (bv == null) return 1;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  if (av instanceof Date && bv instanceof Date) {
    return av.getTime() - bv.getTime();
  }
  return String(av).localeCompare(String(bv), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

// ----------------------------------------------------------- ▲/▼ glyphs

function SortGlyph({ dir }: { dir: "asc" | "desc" | null }) {
  if (!dir) {
    return (
      <span
        aria-hidden="true"
        className="ml-1 inline-block w-2.5 text-[9px] leading-none text-text-subtle/50 select-none"
      >
        ⇅
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="ml-1 inline-block w-2.5 text-[9px] leading-none text-accent select-none"
    >
      {dir === "asc" ? "▲" : "▼"}
    </span>
  );
}

// ----------------------------------------- header / row class composition

function paddingForDensity(density: DataTableDensity, kind: "row" | "head") {
  if (kind === "head") {
    return density === "dense" ? "px-3 py-2" : "px-4 py-3";
  }
  return density === "dense" ? "px-3 py-2" : "px-4 py-3.5";
}

function alignClass(align: DataTableAlign | undefined): string {
  switch (align) {
    case "right":
      return "text-right tabular-nums";
    case "center":
      return "text-center";
    default:
      return "text-left";
  }
}

// ------------------------------------------------------------ select cell

interface SelectionContext {
  isSelected: (key: string) => boolean;
  toggle: (key: string) => void;
  toggleAll: (visibleKeys: string[]) => void;
  visibleAllSelected: boolean;
  visibleSomeSelected: boolean;
}

function SelectionCheckbox({
  checked,
  indeterminate,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className={cn(
        "h-4 w-4 rounded border-border-strong text-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        "transition-colors cursor-pointer",
      )}
    />
  );
}

// ------------------------------------------------------------- DataTable

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  selection,
  density: densityProp,
  showDensityToggle = false,
  onRowClick,
  isLoading = false,
  loadingRowCount = 6,
  emptyState,
  caption,
  toolbar,
  stickyHeader = true,
  maxHeight,
  ariaLabel,
  className,
  rowClassName,
  contextMenuItems,
}: DataTableProps<Row>) {
  // Density: support both controlled (prop) and uncontrolled-with-toggle.
  const [internalDensity, setInternalDensity] =
    React.useState<DataTableDensity>("comfortable");
  const density: DataTableDensity = densityProp ?? internalDensity;

  // Tri-state sort: asc → desc → null.
  const [sort, setSort] = React.useState<SortState | null>(null);

  function cycleSort(colKey: string) {
    setSort((prev) => {
      if (!prev || prev.key !== colKey) return { key: colKey, dir: "asc" };
      if (prev.dir === "asc") return { key: colKey, dir: "desc" };
      return null; // back to natural order
    });
  }

  // Per-row stable key resolver — selection.rowKey wins if available.
  const keyFor = React.useCallback(
    (row: Row, index: number) => {
      if (rowKey) return rowKey(row, index);
      if (selection) return selection.rowKey(row);
      return String(index);
    },
    [rowKey, selection],
  );

  // Apply sort. Empty `sort` ⇒ identity slice.
  const sortedRows = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const cmp = col.sortFn ?? ((a: Row, b: Row) => defaultCompare(col.key as keyof Row & string, a, b));
    const copy = [...rows];
    copy.sort((a, b) => (sort.dir === "asc" ? cmp(a, b) : -cmp(a, b)));
    return copy;
  }, [rows, columns, sort]);

  // ---- Selection helpers --------------------------------------------------
  const selectionCtx: SelectionContext | null = React.useMemo(() => {
    if (!selection) return null;
    const visibleKeys = sortedRows.map((r) => selection.rowKey(r));
    const visibleAllSelected =
      visibleKeys.length > 0 &&
      visibleKeys.every((k) => selection.selected.has(k));
    const visibleSomeSelected = visibleKeys.some((k) =>
      selection.selected.has(k),
    );
    return {
      isSelected: (k) => selection.selected.has(k),
      toggle: (k) => {
        const next = new Set(selection.selected);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        selection.onChange(next);
      },
      toggleAll: (keys) => {
        const next = new Set(selection.selected);
        const everySelected = keys.every((k) => next.has(k));
        if (everySelected) keys.forEach((k) => next.delete(k));
        else keys.forEach((k) => next.add(k));
        selection.onChange(next);
      },
      visibleAllSelected,
      visibleSomeSelected,
    };
  }, [selection, sortedRows]);

  // ---- Keyboard nav state -------------------------------------------------
  const [focusedIndex, setFocusedIndex] = React.useState<number | null>(null);
  const tableContainerRef = React.useRef<HTMLDivElement | null>(null);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (sortedRows.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((i) =>
        i == null ? 0 : Math.min(sortedRows.length - 1, i + 1),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((i) => (i == null ? 0 : Math.max(0, i - 1)));
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIndex(sortedRows.length - 1);
    } else if (
      (e.key === " " || e.key === "Enter") &&
      focusedIndex != null &&
      selection &&
      selectionCtx
    ) {
      e.preventDefault();
      const row = sortedRows[focusedIndex];
      selectionCtx.toggle(selection.rowKey(row));
    }
  }

  // Reset focus when the row set identity changes (e.g. after re-filter).
  React.useEffect(() => {
    setFocusedIndex(null);
  }, [rows]);

  // ---- Render -------------------------------------------------------------

  const totalCols = columns.length + (selection ? 1 : 0);
  const showEmpty = !isLoading && sortedRows.length === 0 && !!emptyState;

  return (
    <div
      className={cn(
        // Apple-iOS card: tinted parchment, subtle border + shadow.
        "relative overflow-hidden rounded-2xl border border-border/70 bg-surface",
        "shadow-sm",
        className,
      )}
    >
      {(toolbar || showDensityToggle) && (
        <div
          className={cn(
            "flex items-center gap-3 border-b border-border/60",
            "px-4 py-2.5",
          )}
        >
          <div className="flex-1 min-w-0">{toolbar}</div>
          {showDensityToggle && (
            <DensityToggle
              value={density}
              onChange={(v) => {
                // If parent passed a controlled density, this is a no-op
                // (we still call setInternalDensity so the toggle visually
                // reflects intent even under control — but the prop wins).
                setInternalDensity(v);
              }}
              disabled={densityProp != null}
            />
          )}
        </div>
      )}

      <div
        ref={tableContainerRef}
        tabIndex={selection ? 0 : -1}
        onKeyDown={onKeyDown}
        role="region"
        aria-label={ariaLabel}
        className={cn(
          "relative overflow-auto",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table
          className="w-full border-collapse text-sm"
          aria-label={ariaLabel}
        >
          {caption && (
            <caption className="sr-only">
              {typeof caption === "string" ? caption : "Data table"}
            </caption>
          )}

          <thead
            className={cn(
              "bg-surface-muted/60 text-text-subtle",
              stickyHeader && "sticky top-0 z-10",
              "backdrop-blur-[2px]",
            )}
          >
            <tr className="border-b border-border/60">
              {selection && selectionCtx && (
                <th
                  scope="col"
                  className={cn(
                    paddingForDensity(density, "head"),
                    "w-10 align-middle",
                  )}
                >
                  <SelectionCheckbox
                    checked={selectionCtx.visibleAllSelected}
                    indeterminate={
                      selectionCtx.visibleSomeSelected &&
                      !selectionCtx.visibleAllSelected
                    }
                    onToggle={() =>
                      selectionCtx.toggleAll(
                        sortedRows.map((r) => selection.rowKey(r)),
                      )
                    }
                    ariaLabel="Select all visible rows"
                  />
                </th>
              )}
              {columns.map((col) => {
                const isSorted = sort?.key === col.key;
                const dir = isSorted ? sort!.dir : null;
                const headerContent = col.headerCell ? (
                  col.headerCell()
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5",
                      "text-[11px] font-medium uppercase tracking-[0.12em]",
                      isSorted ? "text-text" : "text-text-subtle",
                    )}
                  >
                    {col.label}
                    {col.sortable && <SortGlyph dir={dir} />}
                  </span>
                );
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      paddingForDensity(density, "head"),
                      alignClass(col.align),
                      "font-medium",
                      col.hideOnMobile && "hidden sm:table-cell",
                    )}
                    aria-sort={
                      isSorted
                        ? dir === "asc"
                          ? "ascending"
                          : "descending"
                        : col.sortable
                          ? "none"
                          : undefined
                    }
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => cycleSort(col.key)}
                        className={cn(
                          "inline-flex items-center",
                          "transition-colors hover:text-text",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm",
                        )}
                      >
                        {headerContent}
                      </button>
                    ) : (
                      headerContent
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/50">
            {isLoading && (
              <SkeletonRows
                rowCount={loadingRowCount}
                columns={columns}
                density={density}
                hasSelection={!!selection}
              />
            )}

            {!isLoading && showEmpty && (
              <tr>
                <td colSpan={totalCols} className="px-0 py-0">
                  <div className="p-6 sm:p-8">{emptyState}</div>
                </td>
              </tr>
            )}

            {!isLoading &&
              !showEmpty &&
              sortedRows.map((row, idx) => {
                const k = keyFor(row, idx);
                const selected = selectionCtx?.isSelected(k) ?? false;
                const focused = focusedIndex === idx;
                const interactive = !!onRowClick;
                const extraRowClass = rowClassName?.(row, idx);
                return (
                  <DataTableBodyRow<Row>
                    key={k}
                    row={row}
                    index={idx}
                    columns={columns}
                    density={density}
                    selected={selected}
                    focused={focused}
                    interactive={interactive}
                    extraRowClass={extraRowClass}
                    onClick={() => onRowClick?.(row, idx)}
                    onMouseEnter={() => setFocusedIndex(idx)}
                    selection={selection}
                    selectionCtx={selectionCtx}
                    contextMenuItems={contextMenuItems}
                  />
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------- body row + ctx menu
//
// Extracted into its own component so each row can call `useContextMenu`
// at the top level. The hook can't be invoked inside `.map(...)`.

interface DataTableBodyRowProps<Row> {
  row: Row;
  index: number;
  columns: ColumnDef<Row>[];
  density: DataTableDensity;
  selected: boolean;
  focused: boolean;
  interactive: boolean;
  extraRowClass?: string;
  onClick: () => void;
  onMouseEnter: () => void;
  selection?: DataTableSelection<Row>;
  selectionCtx: SelectionContext | null;
  contextMenuItems?: (row: Row, index: number) => ContextMenuItem[] | null;
}

function DataTableBodyRow<Row>({
  row,
  index,
  columns,
  density,
  selected,
  focused,
  interactive,
  extraRowClass,
  onClick,
  onMouseEnter,
  selection,
  selectionCtx,
  contextMenuItems,
}: DataTableBodyRowProps<Row>) {
  // Lazy item resolver — the hook resolves it only when the menu opens,
  // so per-row items never run at render time for every row in the list.
  const itemsFn = React.useCallback(
    () => contextMenuItems?.(row, index) ?? [],
    [contextMenuItems, row, index],
  );
  const ctx = useContextMenu(itemsFn);
  const hasMenu =
    !!contextMenuItems && (contextMenuItems(row, index)?.length ?? 0) > 0;

  return (
    <tr
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onContextMenu={hasMenu ? ctx.triggerProps.onContextMenu : undefined}
      onTouchStart={hasMenu ? ctx.triggerProps.onTouchStart : undefined}
      onTouchEnd={hasMenu ? ctx.triggerProps.onTouchEnd : undefined}
      onTouchMove={hasMenu ? ctx.triggerProps.onTouchMove : undefined}
      className={cn(
        "transition-colors",
        interactive && "cursor-pointer",
        focused && "bg-accent-soft/30",
        selected && "bg-accent-soft/50",
        !selected && !focused && "hover:bg-surface-muted/40",
        extraRowClass,
      )}
      aria-selected={selection ? selected : undefined}
    >
      {selection && selectionCtx && (
        <td className={cn(paddingForDensity(density, "row"), "align-middle")}>
          <SelectionCheckbox
            checked={selected}
            onToggle={() => selectionCtx.toggle(selection.rowKey(row))}
            ariaLabel={`Select row ${index + 1}`}
          />
        </td>
      )}
      {columns.map((col) => {
        const content = col.cell
          ? col.cell(row, { index })
          : (row as Record<string, React.ReactNode>)[col.key];
        return (
          <td
            key={col.key}
            className={cn(
              paddingForDensity(density, "row"),
              alignClass(col.align),
              "align-middle text-text",
              col.hideOnMobile && "hidden sm:table-cell",
            )}
          >
            {content as React.ReactNode}
          </td>
        );
      })}
      {hasMenu && ctx.menu}
    </tr>
  );
}

// ------------------------------------------------------------- skeleton

function SkeletonRows<Row>({
  rowCount,
  columns,
  density,
  hasSelection,
}: {
  rowCount: number;
  columns: ColumnDef<Row>[];
  density: DataTableDensity;
  hasSelection: boolean;
}) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, r) => (
        <tr key={`sk-${r}`}>
          {hasSelection && (
            <td className={paddingForDensity(density, "row")}>
              <Skeleton className="h-4 w-4 rounded" />
            </td>
          )}
          {columns.map((col) => (
            <td
              key={col.key}
              className={cn(
                paddingForDensity(density, "row"),
                alignClass(col.align),
                col.hideOnMobile && "hidden sm:table-cell",
              )}
            >
              <Skeleton
                className={cn(
                  "h-3.5 rounded",
                  col.align === "right" ? "ml-auto w-16" : "w-3/4",
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------- density toggle

function DensityToggle({
  value,
  onChange,
  disabled,
}: {
  value: DataTableDensity;
  onChange: (next: DataTableDensity) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Row density"
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-surface p-0.5",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      {(["comfortable", "dense"] as DataTableDensity[]).map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            aria-pressed={active}
            className={cn(
              "h-7 px-3 rounded-full text-[11px] font-medium transition-colors",
              active
                ? "bg-text text-surface"
                : "text-text-muted hover:text-text",
            )}
          >
            {opt === "comfortable" ? "Comfortable" : "Dense"}
          </button>
        );
      })}
    </div>
  );
}
