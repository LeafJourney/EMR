"use client";

// Equity entries register, adopted onto the shared <DataTable> primitive so
// every column header sorts (MASTER prompt G5 / EMR-1018) and the whole table
// can be downloaded or printed (G6). Money is pre-formatted server-side and
// passed as display strings; the numeric *cents* fields ride along purely so
// the columns sort by real magnitude rather than by the formatted string.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface EquityRow {
  id: string;
  dateDisplay: string;
  dateMs: number;
  typeLabel: string;
  isInflow: boolean;
  description: string;
  ownerName: string;
  amountDisplay: string;
  amountCents: number;
}

export function EquityTable({ rows }: { rows: EquityRow[] }) {
  const columns: ColumnDef<EquityRow>[] = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      cell: (r) => r.dateDisplay,
      sortFn: (a, b) => a.dateMs - b.dateMs,
      exportValue: (r) => r.dateDisplay,
    },
    {
      key: "typeLabel",
      label: "Type",
      sortable: true,
      cell: (r) => (
        <Badge tone={r.isInflow ? "success" : "warning"} className="text-[10px]">
          {r.typeLabel}
        </Badge>
      ),
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
    },
    {
      key: "ownerName",
      label: "Owner",
      sortable: true,
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      align: "right",
      cell: (r) => (
        <span className={r.isInflow ? "text-success" : "text-danger"}>
          {r.amountDisplay}
        </span>
      ),
      sortFn: (a, b) => a.amountCents - b.amountCents,
      exportValue: (r) => (r.amountCents / 100).toFixed(2),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Equity entries"
      exportable
      exportName="equity"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No equity entries yet.
        </p>
      }
    />
  );
}
