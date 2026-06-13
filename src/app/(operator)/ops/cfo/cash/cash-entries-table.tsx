"use client";

// Recent cash movements table, adopted onto the shared <DataTable> primitive so
// every column header sorts (MASTER prompt G5 / EMR-1018) and the whole table
// can be downloaded or printed (G6). Money and dates are pre-formatted
// server-side and passed as display strings; numeric/ms fields ride along for
// correct magnitude sorting.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface CashEntryRow {
  id: string;
  dateDisplay: string;
  dateMs: number;
  description: string;
  activity: string;
  accountName: string;
  amountDisplay: string;
  /** Signed cents: positive = in, negative = out */
  amountSignedCents: number;
  direction: "in" | "out";
}

export function CashEntriesTable({ rows }: { rows: CashEntryRow[] }) {
  const columns: ColumnDef<CashEntryRow>[] = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      cell: (r) => (
        <span className="tabular-nums whitespace-nowrap text-text-muted">
          {r.dateDisplay}
        </span>
      ),
      sortFn: (a, b) => a.dateMs - b.dateMs,
      exportValue: (r) => r.dateDisplay,
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
      cell: (r) => (
        <span className="truncate max-w-md block text-text">{r.description}</span>
      ),
    },
    {
      key: "activity",
      label: "Activity",
      sortable: true,
      cell: (r) => (
        <Badge tone="neutral" className="text-[10px]">
          {r.activity}
        </Badge>
      ),
    },
    {
      key: "accountName",
      label: "Account",
      sortable: true,
      cell: (r) => (
        <span className="text-text-muted">{r.accountName}</span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      align: "right",
      cell: (r) => (
        <span
          className={`tabular-nums ${
            r.direction === "in" ? "text-success" : "text-danger"
          }`}
        >
          {r.amountDisplay}
        </span>
      ),
      sortFn: (a, b) => a.amountSignedCents - b.amountSignedCents,
      exportValue: (r) => (r.amountSignedCents / 100).toFixed(2),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Recent cash movements"
      exportable
      exportName="cash-movements"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No cash movements logged yet.
        </p>
      }
    />
  );
}
