"use client";

// Charity registry table, adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5 / EMR-1018) and the whole table can be
// downloaded or printed (G6).

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface CharityRow {
  id: string;
  charityName: string;
  categoryDisplay: string;
  opportunity: string;
  vetted: boolean;
  vettedDisplay: string;
}

export function CharityTable({ rows }: { rows: CharityRow[] }) {
  const columns: ColumnDef<CharityRow>[] = [
    { key: "charityName", label: "Charity", sortable: true },
    { key: "categoryDisplay", label: "Category", sortable: true },
    { key: "opportunity", label: "Opportunity", sortable: true },
    {
      key: "vetted",
      label: "Vetted",
      sortable: true,
      sortFn: (a, b) => Number(b.vetted) - Number(a.vetted),
      exportValue: (r) => r.vettedDisplay,
      cell: (r) =>
        r.vetted ? (
          <Badge tone="success">{r.vettedDisplay}</Badge>
        ) : (
          <Badge tone="warning">Pending</Badge>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Charity registry"
      exportable
      exportName="volunteer-program"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No charities in the registry yet.
        </p>
      }
    />
  );
}
