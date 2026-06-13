"use client";

// Fixed assets register, adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5 / EMR-1018) and the whole table can be
// downloaded or printed (G6). Money is pre-formatted server-side and passed as
// display strings; the numeric *cents* fields ride along purely so the columns
// sort by real magnitude rather than by the formatted string.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface AssetRow {
  id: string;
  name: string;
  categoryLabel: string;
  acquiredDisplay: string;
  acquiredMs: number;
  costDisplay: string;
  costCents: number;
  lifeDisplay: string;
  usefulLifeMonths: number;
  netBookDisplay: string;
  netBookCents: number;
}

export function AssetsTable({ rows }: { rows: AssetRow[] }) {
  const columns: ColumnDef<AssetRow>[] = [
    { key: "name", label: "Name", sortable: true },
    {
      key: "categoryLabel",
      label: "Category",
      sortable: true,
      cell: (r) => (
        <Badge tone="neutral" className="text-[10px]">
          {r.categoryLabel}
        </Badge>
      ),
    },
    {
      key: "acquired",
      label: "Acquired",
      sortable: true,
      cell: (r) => r.acquiredDisplay,
      sortFn: (a, b) => a.acquiredMs - b.acquiredMs,
      exportValue: (r) => r.acquiredDisplay,
    },
    {
      key: "cost",
      label: "Cost",
      sortable: true,
      align: "right",
      cell: (r) => r.costDisplay,
      sortFn: (a, b) => a.costCents - b.costCents,
      exportValue: (r) => (r.costCents / 100).toFixed(2),
    },
    {
      key: "life",
      label: "Life",
      sortable: true,
      align: "right",
      cell: (r) => r.lifeDisplay,
      sortFn: (a, b) => a.usefulLifeMonths - b.usefulLifeMonths,
      exportValue: (r) => String(r.usefulLifeMonths),
    },
    {
      key: "netBook",
      label: "Net book",
      sortable: true,
      align: "right",
      cell: (r) => r.netBookDisplay,
      sortFn: (a, b) => a.netBookCents - b.netBookCents,
      exportValue: (r) => (r.netBookCents / 100).toFixed(2),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Fixed Assets"
      exportable
      exportName="fixed-assets"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No capitalized assets yet.
        </p>
      }
    />
  );
}
