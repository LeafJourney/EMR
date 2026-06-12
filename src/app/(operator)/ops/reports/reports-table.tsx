"use client";

// Backing-data table for the Reports page, adopted onto the shared
// <DataTable> primitive so every column header sorts (MASTER prompt G5 /
// EMR-1018) and the whole table can be downloaded or printed (G6).
// Values are pre-formatted server-side and passed as display strings; the
// raw numeric field rides along purely so the Value column sorts by real
// magnitude rather than by the formatted string.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface ReportDataRow {
  /** Stable React key — same as label in practice. */
  id: string;
  /** Human label on the X axis (e.g. "Cannabis" or "2026-03"). */
  label: string;
  /** Pre-formatted display value (e.g. "$1,234" or "42"). */
  valueDisplay: string;
  /** Raw numeric value for correct magnitude sort. */
  value: number;
  /** True when this row is a forecast (projection reports). */
  forecast: boolean;
}

interface ReportsTableProps {
  rows: ReportDataRow[];
  /** Column header for the dimension (e.g. "Conditions", "Providers"). */
  dimensionLabel: string;
}

export function ReportsTable({ rows, dimensionLabel }: ReportsTableProps) {
  const columns: ColumnDef<ReportDataRow>[] = [
    {
      key: "label",
      label: dimensionLabel,
      sortable: true,
    },
    {
      key: "value",
      label: "Value",
      sortable: true,
      align: "right",
      cell: (r) => r.valueDisplay,
      sortFn: (a, b) => a.value - b.value,
      exportValue: (r) => r.value,
    },
    {
      key: "source",
      label: "Source",
      sortable: true,
      cell: (r) =>
        r.forecast ? (
          <Badge tone="warning">forecast</Badge>
        ) : (
          <Badge tone="neutral">observed</Badge>
        ),
      sortFn: (a, b) =>
        Number(a.forecast) - Number(b.forecast),
      exportValue: (r) => (r.forecast ? "forecast" : "observed"),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Backing data"
      exportable
      exportName="report-data"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No data rows — adjust the dimension or metric and re-render.
        </p>
      }
    />
  );
}
