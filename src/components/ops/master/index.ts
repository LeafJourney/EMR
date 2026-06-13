// MASTER-prompt kit — the shared owner-portal (/ops) UI primitives the
// "Owner Portal Revisions" directive mandates across every page. A single
// import surface so pages adopt the same building blocks instead of
// hand-rolling each table / section / list.
//
// Coverage of the MASTER-prompt "layout law":
//   G1 Collapsible sections        → <Collapsible>
//   G3 7-result page autocomplete  → <AutocompleteInput> (+ rankAutocomplete core)
//   G5 Sortable table columns      → <DataTable> (tri-state header sort, built-in)
//   G6 Table send/print/download   → <DataTable exportable> + table-export utils
//   G7 Movable / rearrangeable     → <SortableList> / <KanbanBoard> / reorder()
//   G9 Compare mode               → <MetricBoxGroup> (select ≥2 → overlay chart)
//   G10 "click a box → popup"      → <MetricBox> (history popup + feather cycle)
//   G11 Hover tooltips on charts   → <MetricBox> drill-in (branded chart hover)
//
// Still to build (tracked, not yet shipped): global sidebar overlay/autohide
// (G2 layered/autohide half remains; in-page-click re-open fixed via PR #648)
// and the per-section AI search bar (G8).

export { Collapsible } from "@/components/ui/collapsible";

export {
  AutocompleteInput,
  type AutocompleteInputProps,
} from "@/components/ui/autocomplete-input";

export {
  rankAutocomplete,
  scoreOption,
  AUTOCOMPLETE_DEFAULT_LIMIT,
  type AutocompleteOption,
} from "@/lib/ui/autocomplete-match";

export {
  MetricBox,
  type MetricBoxProps,
  type MetricPoint,
} from "./MetricBox";

export {
  MetricBoxGroup,
  type MetricBoxGroupProps,
  type MetricBoxGroupItem,
} from "./MetricBoxGroup";

export {
  cycleChartType,
  summarizeSeries,
  formatMetricValue,
  mergeSeriesByLabel,
  METRIC_CHART_TYPES,
  type MetricChartType,
  type MetricValueFormat,
  type SeriesSummary,
  type MetricDirection,
  type CompareSeriesInput,
  type CompareLine,
  type CompareDataset,
} from "./metric-box-utils";

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
