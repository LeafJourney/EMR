"use client";

// Liabilities register, adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5 / EMR-1018) and the whole table can be
// downloaded or printed (G6). Money is pre-formatted server-side and passed as
// display strings; the numeric *cents* fields ride along purely so the columns
// sort by real magnitude rather than by the formatted string.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface LiabilityRow {
  id: string;
  name: string;
  typeLabel: string;
  balanceDisplay: string;
  balanceCents: number;
  rateDisplay: string;
  rate: number | null;
  monthlyDisplay: string;
  monthlyCents: number | null;
  maturityDisplay: string;
  maturityMs: number | null;
}

export function LiabilitiesTable({ rows }: { rows: LiabilityRow[] }) {
  const columns: ColumnDef<LiabilityRow>[] = [
    { key: "name", label: "Name", sortable: true },
    {
      key: "typeLabel",
      label: "Type",
      sortable: true,
      cell: (r) => (
        <Badge tone="neutral" className="text-[10px]">
          {r.typeLabel}
        </Badge>
      ),
    },
    {
      key: "balance",
      label: "Balance",
      sortable: true,
      align: "right",
      cell: (r) => r.balanceDisplay,
      sortFn: (a, b) => a.balanceCents - b.balanceCents,
      exportValue: (r) => (r.balanceCents / 100).toFixed(2),
    },
    {
      key: "rate",
      label: "Rate",
      sortable: true,
      align: "right",
      cell: (r) => r.rateDisplay,
      sortFn: (a, b) => (a.rate ?? -1) - (b.rate ?? -1),
      exportValue: (r) => (r.rate != null ? (r.rate * 100).toFixed(2) : ""),
    },
    {
      key: "monthly",
      label: "Monthly pmt",
      sortable: true,
      align: "right",
      cell: (r) => r.monthlyDisplay,
      sortFn: (a, b) => (a.monthlyCents ?? -1) - (b.monthlyCents ?? -1),
      exportValue: (r) =>
        r.monthlyCents != null ? (r.monthlyCents / 100).toFixed(2) : "",
    },
    {
      key: "maturity",
      label: "Maturity",
      sortable: true,
      cell: (r) => r.maturityDisplay,
      sortFn: (a, b) => (a.maturityMs ?? 0) - (b.maturityMs ?? 0),
      exportValue: (r) => r.maturityDisplay,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Liabilities"
      exportable
      exportName="liabilities"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No outstanding liabilities — nice.
        </p>
      }
    />
  );
}
