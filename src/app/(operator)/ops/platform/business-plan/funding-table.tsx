"use client";

// Use-of-proceeds table adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5 / EMR-1018) and the whole table can be
// downloaded or printed (G6). Money is pre-formatted server-side and passed as
// display strings; the numeric field rides along purely so the Allocation column
// sorts by real magnitude rather than by the formatted string.

import { DataTable, type ColumnDef } from "@/components/ops/master";

export interface FundingUseRow {
  id: string;
  category: string;
  allocationDisplay: string;
  allocationUsd: number;
  rationale: string;
}

export function FundingTable({ rows }: { rows: FundingUseRow[] }) {
  const columns: ColumnDef<FundingUseRow>[] = [
    { key: "category", label: "Use of proceeds", sortable: true },
    {
      key: "allocation",
      label: "Allocation",
      sortable: true,
      align: "right",
      cell: (r) => r.allocationDisplay,
      sortFn: (a, b) => a.allocationUsd - b.allocationUsd,
      exportValue: (r) => r.allocationUsd.toFixed(2),
    },
    { key: "rationale", label: "Rationale", sortable: true },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Funding use of proceeds"
      exportable
      exportName="funding-use-of-proceeds"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No use-of-proceeds entries defined.
        </p>
      }
    />
  );
}
