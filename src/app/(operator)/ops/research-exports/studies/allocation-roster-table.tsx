"use client";

// Allocation roster, adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5 / EMR-1018) and the whole table can be
// downloaded or printed (G6).

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface AllocationRosterRow {
  patientId: string;
  stratum: string;
  block: string;
  blindingCode: string;
  arm: string;
}

const columns: ColumnDef<AllocationRosterRow>[] = [
  { key: "patientId", label: "Patient", sortable: true },
  { key: "stratum", label: "Stratum", sortable: true },
  { key: "block", label: "Block", sortable: true },
  { key: "blindingCode", label: "Blinding code", sortable: true },
  {
    key: "arm",
    label: "Arm",
    sortable: true,
    cell: (r) => <Badge tone="accent">{r.arm}</Badge>,
    exportValue: (r) => r.arm,
  },
];

export function AllocationRosterTable({ rows }: { rows: AllocationRosterRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.patientId}
      ariaLabel="Allocation roster"
      exportable
      exportName="allocation-roster"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No allocations — configure a study and click Re-randomize.
        </p>
      }
    />
  );
}
