"use client";

// Feature matrix table, adopted onto the shared <DataTable> primitive so
// every column header sorts (MASTER prompt G5 / EMR-1018) and the whole
// table can be downloaded or printed (G6).

import { DataTable, type ColumnDef } from "@/components/ops/master";

export interface FeatureMatrixRow {
  feature: string;
  starter: boolean;
  growth: boolean;
  scale: boolean;
  enterprise: boolean;
}

function BoolCell({ value }: { value: boolean }) {
  return value ? (
    <span className="text-success font-medium">✓</span>
  ) : (
    <span className="text-text-subtle">—</span>
  );
}

export function FeatureMatrixTable({ rows }: { rows: FeatureMatrixRow[] }) {
  const columns: ColumnDef<FeatureMatrixRow>[] = [
    { key: "feature", label: "Feature", sortable: true },
    {
      key: "starter",
      label: "Starter",
      sortable: true,
      align: "center",
      cell: (r) => <BoolCell value={r.starter} />,
      sortFn: (a, b) => Number(a.starter) - Number(b.starter),
      exportValue: (r) => (r.starter ? "Yes" : "No"),
    },
    {
      key: "growth",
      label: "Growth",
      sortable: true,
      align: "center",
      cell: (r) => <BoolCell value={r.growth} />,
      sortFn: (a, b) => Number(a.growth) - Number(b.growth),
      exportValue: (r) => (r.growth ? "Yes" : "No"),
    },
    {
      key: "scale",
      label: "Scale",
      sortable: true,
      align: "center",
      cell: (r) => <BoolCell value={r.scale} />,
      sortFn: (a, b) => Number(a.scale) - Number(b.scale),
      exportValue: (r) => (r.scale ? "Yes" : "No"),
    },
    {
      key: "enterprise",
      label: "Enterprise",
      sortable: true,
      align: "center",
      cell: (r) => <BoolCell value={r.enterprise} />,
      sortFn: (a, b) => Number(a.enterprise) - Number(b.enterprise),
      exportValue: (r) => (r.enterprise ? "Yes" : "No"),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.feature}
      ariaLabel="Feature matrix"
      exportable
      exportName="feature-matrix"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No features listed.
        </p>
      }
    />
  );
}
