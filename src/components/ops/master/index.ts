// MASTER-prompt kit — the shared owner-portal (/ops) UI primitives the
// "Owner Portal Revisions" directive mandates across every page. A single
// import surface so pages adopt the same building blocks instead of
// hand-rolling each table / section / list.
//
// Coverage of the MASTER-prompt "layout law":
//   G1 Collapsible sections        → <Collapsible>
//   G5 Sortable table columns      → <DataTable> (tri-state header sort, built-in)
//   G6 Table send/print/download   → <DataTable exportable> + table-export utils
//   G7 Movable / rearrangeable     → <SortableList> / <KanbanBoard> / reorder()
//
// Still to build (tracked, not yet shipped): global sidebar overlay/autohide
// (G2), 7-result autocomplete inputs (G3), per-section AI search bar (G8),
// compare-mode + "beautify" popups (G9/G10).

export { Collapsible } from "@/components/ui/collapsible";

export {
  DataTable,
  type ColumnDef,
  type DataTableProps,
  type DataTableSelection,
  type DataTableAlign,
  type DataTableDensity,
} from "@/components/ui/data-table";

export {
  SortableList,
  KanbanBoard,
  reorder,
  type SortableListProps,
  type SortableRenderArgs,
  type DragHandleProps,
  type KanbanBoardProps,
  type KanbanColumn,
} from "@/components/ui/sortable";

export {
  buildCsv,
  downloadCsv,
  printTable,
  escapeCsvCell,
  tableToPrintableHtml,
  type CellValue,
} from "@/lib/ui/table-export";
