"use client";

// Tier reference table, adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5) and the whole table can be downloaded
// or printed (G6). monthlyList rides along as the numeric field so the Monthly
// column sorts by real price rather than by the formatted string.

import { DataTable, type ColumnDef } from "@/components/ops/master";

export interface TierRow {
  id: string;
  label: string;
  monthlyLabel: string;
  monthlyList: number | null;
  bestFor: string;
  blurb: string;
}

export function ModulesTierTable({ rows }: { rows: TierRow[] }) {
  const columns: ColumnDef<TierRow>[] = [
    { key: "label", label: "Tier", sortable: true },
    {
      key: "monthly",
      label: "Monthly",
      sortable: true,
      cell: (r) => r.monthlyLabel,
      sortFn: (a, b) => (a.monthlyList ?? -1) - (b.monthlyList ?? -1),
      exportValue: (r) =>
        r.monthlyList != null ? String(r.monthlyList) : r.monthlyLabel,
    },
    { key: "bestFor", label: "Best for", sortable: true },
    { key: "blurb", label: "Pitch", sortable: true },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Tier reference"
      exportable
      exportName="platform-modules-tiers"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No tiers defined.
        </p>
      }
    />
  );
}
