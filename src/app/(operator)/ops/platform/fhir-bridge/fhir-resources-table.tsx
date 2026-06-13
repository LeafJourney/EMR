"use client";

// FHIR resource coverage table, adopted onto the shared <DataTable> primitive so
// every column header sorts (MASTER prompt G5 / EMR-1018) and the whole table can
// be downloaded or printed (G6).

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface FhirResourceRow {
  id: string;
  resource: string;
  description: string;
  /** Comma-separated for export; rendered as individual badges in the cell. */
  operationsDisplay: string;
  /** The raw array, used by the sort function and badge cell. */
  operations: string[];
}

export function FhirResourcesTable({ rows }: { rows: FhirResourceRow[] }) {
  const columns: ColumnDef<FhirResourceRow>[] = [
    {
      key: "resource",
      label: "Resource",
      sortable: true,
      cell: (r) => <span className="font-mono">{r.resource}</span>,
    },
    {
      key: "description",
      label: "Description",
      sortable: true,
      cell: (r) => <span className="text-text-muted">{r.description}</span>,
    },
    {
      key: "operationsDisplay",
      label: "Operations",
      sortable: true,
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.operations.map((op) => (
            <Badge key={op} tone="success">
              {op}
            </Badge>
          ))}
        </div>
      ),
      sortFn: (a, b) => a.operations.length - b.operations.length,
      exportValue: (r) => r.operationsDisplay,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="FHIR resource coverage"
      exportable
      exportName="fhir-resources"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No FHIR resources configured.
        </p>
      }
    />
  );
}
