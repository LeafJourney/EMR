"use client";

// MIPS measure detail table, adopted onto the shared <DataTable> primitive so
// every column header sorts (MASTER prompt G5 / EMR-1018) and the table can be
// downloaded or printed (G6). Numerics are pre-formatted server-side and passed
// as display strings; raw numeric fields ride along purely for sort magnitude.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface MipsMeasureRow {
  id: string;
  /** e.g. "MIPS-001" */
  measureId: string;
  title: string;
  categoryLabel: string;
  numerator: number;
  denominator: number;
  /** display string e.g. "73%" */
  performanceDisplay: string;
  /** raw 0–1 fraction for sorting */
  performance: number;
  /** display string e.g. "8.5" */
  scoreDisplay: string;
  /** raw number for sorting */
  scorePoints: number;
  /** raw blocker count for sorting */
  blockerCount: number;
}

export function MipsTable({ rows }: { rows: MipsMeasureRow[] }) {
  const columns: ColumnDef<MipsMeasureRow>[] = [
    {
      key: "measure",
      label: "Measure",
      sortable: true,
      sortFn: (a, b) => a.title.localeCompare(b.title),
      exportValue: (r) => `${r.measureId} – ${r.title} (${r.categoryLabel})`,
      cell: (r) => (
        <div>
          <p className="font-medium">{r.title}</p>
          <p className="text-[11px] text-text-subtle font-mono">
            {r.measureId} · {r.categoryLabel}
          </p>
        </div>
      ),
    },
    {
      key: "numerator",
      label: "Numerator",
      sortable: true,
      align: "right",
      cell: (r) => <span className="font-mono">{r.numerator}</span>,
      sortFn: (a, b) => a.numerator - b.numerator,
      exportValue: (r) => String(r.numerator),
    },
    {
      key: "denominator",
      label: "Denominator",
      sortable: true,
      align: "right",
      cell: (r) => <span className="font-mono">{r.denominator}</span>,
      sortFn: (a, b) => a.denominator - b.denominator,
      exportValue: (r) => String(r.denominator),
    },
    {
      key: "performance",
      label: "Performance",
      sortable: true,
      align: "right",
      cell: (r) => <span className="font-mono">{r.performanceDisplay}</span>,
      sortFn: (a, b) => a.performance - b.performance,
      exportValue: (r) => r.performanceDisplay,
    },
    {
      key: "score",
      label: "Score",
      sortable: true,
      align: "right",
      cell: (r) => <span className="font-mono">{r.scoreDisplay}</span>,
      sortFn: (a, b) => a.scorePoints - b.scorePoints,
      exportValue: (r) => r.scoreDisplay,
    },
    {
      key: "blockers",
      label: "Blockers",
      sortable: true,
      sortFn: (a, b) => a.blockerCount - b.blockerCount,
      exportValue: (r) =>
        r.blockerCount === 0 ? "All clear" : `${r.blockerCount} patient(s)`,
      cell: (r) =>
        r.blockerCount === 0 ? (
          <Badge tone="success">All clear</Badge>
        ) : (
          <span className="text-text-muted text-xs">
            {r.blockerCount} patient(s)
          </span>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="MIPS measures"
      exportable
      exportName="mips-measures"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No measures available for this period.
        </p>
      }
    />
  );
}
