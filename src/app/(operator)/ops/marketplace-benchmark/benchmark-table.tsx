"use client";

// Marketplace Benchmark feature-matrix table, adopted onto the shared
// <DataTable> primitive so every column header sorts (MASTER prompt G5 /
// EMR-303) and the whole table can be downloaded or printed (G6).

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

const STATUS_TONE: Record<string, string> = {
  shipped: "bg-leaf-soft text-leaf-ink",
  partial: "bg-amber-100 text-amber-800",
  missing: "bg-rose-100 text-rose-800",
};

export interface BenchmarkRow {
  id: string;
  name: string;
  notes: string | null;
  categoryLabel: string;
  category: string;
  amazonReference: string;
  status: "shipped" | "partial" | "missing";
  priority: "P0" | "P1" | "P2";
  ticket: string | null;
}

export function BenchmarkTable({ rows }: { rows: BenchmarkRow[] }) {
  const columns: ColumnDef<BenchmarkRow>[] = [
    {
      key: "name",
      label: "Feature",
      sortable: true,
      cell: (r) => (
        <div>
          <div className="font-medium text-text">{r.name}</div>
          {r.notes && (
            <div className="text-xs text-text-muted mt-1">{r.notes}</div>
          )}
        </div>
      ),
      exportValue: (r) => r.name,
    },
    {
      key: "categoryLabel",
      label: "Category",
      sortable: true,
      cell: (r) => (
        <span className="text-text-muted">{r.categoryLabel}</span>
      ),
    },
    {
      key: "amazonReference",
      label: "Amazon reference",
      sortable: true,
      cell: (r) => (
        <span className="text-text-muted">{r.amazonReference}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      cell: (r) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[r.status]}`}
        >
          {r.status}
        </span>
      ),
      exportValue: (r) => r.status,
    },
    {
      key: "priority",
      label: "Priority",
      sortable: true,
      cell: (r) => <Badge>{r.priority}</Badge>,
      exportValue: (r) => r.priority,
    },
    {
      key: "ticket",
      label: "Ticket",
      sortable: true,
      cell: (r) => (
        <span className="font-mono text-xs">{r.ticket ?? "—"}</span>
      ),
      exportValue: (r) => r.ticket ?? "",
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Feature matrix"
      exportable
      exportName="marketplace-benchmark"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No benchmark features defined.
        </p>
      }
    />
  );
}
