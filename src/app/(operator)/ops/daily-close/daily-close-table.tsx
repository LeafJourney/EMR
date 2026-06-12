"use client";

// Last-30-days history table, adopted onto the shared <DataTable> primitive so
// every column header sorts (MASTER prompt G5 / EMR-1018) and the whole table
// can be downloaded or printed (G6). Money and dates are pre-formatted
// server-side; numeric sort fields ride along for correct magnitude ordering.

import { DataTable, type ColumnDef } from "@/components/ops/master";

export interface DailyCloseRow {
  id: string;
  /** Formatted date string, e.g. "06/10/2026" */
  dateDisplay: string;
  /** Epoch ms for sort */
  dateMs: number;
  billedDisplay: string;
  billedCents: number;
  paidDisplay: string;
  paidCents: number;
  arDisplay: string;
  arCents: number;
  stale: number;
  overdue: number;
}

export function DailyCloseTable({ rows }: { rows: DailyCloseRow[] }) {
  const columns: ColumnDef<DailyCloseRow>[] = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      cell: (r) => r.dateDisplay,
      sortFn: (a, b) => a.dateMs - b.dateMs,
      exportValue: (r) => r.dateDisplay,
    },
    {
      key: "billed",
      label: "Billed",
      sortable: true,
      align: "right",
      cell: (r) => r.billedDisplay,
      sortFn: (a, b) => a.billedCents - b.billedCents,
      exportValue: (r) => (r.billedCents / 100).toFixed(2),
    },
    {
      key: "paid",
      label: "Paid",
      sortable: true,
      align: "right",
      cell: (r) => <span className="text-success">{r.paidDisplay}</span>,
      sortFn: (a, b) => a.paidCents - b.paidCents,
      exportValue: (r) => (r.paidCents / 100).toFixed(2),
    },
    {
      key: "ar",
      label: "AR",
      sortable: true,
      align: "right",
      cell: (r) => r.arDisplay,
      sortFn: (a, b) => a.arCents - b.arCents,
      exportValue: (r) => (r.arCents / 100).toFixed(2),
    },
    {
      key: "stale",
      label: "Stale",
      sortable: true,
      align: "right",
      cell: (r) => String(r.stale),
      sortFn: (a, b) => a.stale - b.stale,
      exportValue: (r) => String(r.stale),
    },
    {
      key: "overdue",
      label: "Overdue",
      sortable: true,
      align: "right",
      cell: (r) => String(r.overdue),
      sortFn: (a, b) => a.overdue - b.overdue,
      exportValue: (r) => String(r.overdue),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Daily close history"
      exportable
      exportName="daily-close"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No close history yet.
        </p>
      }
    />
  );
}
