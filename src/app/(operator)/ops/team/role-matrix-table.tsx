"use client";

// Role-permission matrix, adopted onto the shared <DataTable> primitive so
// every column header sorts (MASTER prompt G5 / EMR-1018) and the whole table
// can be downloaded or printed (G6). Booleans are pre-evaluated server-side
// and passed as `granted` flags; the display cell renders ✓ or — from those.

import { DataTable, type ColumnDef } from "@/components/ops/master";

export interface RoleMatrixRow {
  id: string;
  role: string;
  demographics: boolean;
  billing: boolean;
  readNotes: boolean;
  authorSignNotes: boolean;
  prescribe: boolean;
  sensitiveDx: boolean;
  chartPrivacy: boolean;
}

function PermCell({ granted }: { granted: boolean }) {
  return granted ? (
    <span className="text-accent" aria-label="yes">
      ✓
    </span>
  ) : (
    <span className="text-text-muted/40" aria-label="no">
      —
    </span>
  );
}

export function RoleMatrixTable({ rows }: { rows: RoleMatrixRow[] }) {
  const columns: ColumnDef<RoleMatrixRow>[] = [
    { key: "role", label: "Role", sortable: true },
    {
      key: "demographics",
      label: "Demographics",
      sortable: true,
      align: "right",
      cell: (r) => <PermCell granted={r.demographics} />,
      sortFn: (a, b) => Number(a.demographics) - Number(b.demographics),
      exportValue: (r) => (r.demographics ? "Yes" : "No"),
    },
    {
      key: "billing",
      label: "Billing",
      sortable: true,
      align: "right",
      cell: (r) => <PermCell granted={r.billing} />,
      sortFn: (a, b) => Number(a.billing) - Number(b.billing),
      exportValue: (r) => (r.billing ? "Yes" : "No"),
    },
    {
      key: "readNotes",
      label: "Read notes",
      sortable: true,
      align: "right",
      cell: (r) => <PermCell granted={r.readNotes} />,
      sortFn: (a, b) => Number(a.readNotes) - Number(b.readNotes),
      exportValue: (r) => (r.readNotes ? "Yes" : "No"),
    },
    {
      key: "authorSignNotes",
      label: "Author & sign notes",
      sortable: true,
      align: "right",
      cell: (r) => <PermCell granted={r.authorSignNotes} />,
      sortFn: (a, b) => Number(a.authorSignNotes) - Number(b.authorSignNotes),
      exportValue: (r) => (r.authorSignNotes ? "Yes" : "No"),
    },
    {
      key: "prescribe",
      label: "Prescribe",
      sortable: true,
      align: "right",
      cell: (r) => <PermCell granted={r.prescribe} />,
      sortFn: (a, b) => Number(a.prescribe) - Number(b.prescribe),
      exportValue: (r) => (r.prescribe ? "Yes" : "No"),
    },
    {
      key: "sensitiveDx",
      label: "Sensitive dx",
      sortable: true,
      align: "right",
      cell: (r) => <PermCell granted={r.sensitiveDx} />,
      sortFn: (a, b) => Number(a.sensitiveDx) - Number(b.sensitiveDx),
      exportValue: (r) => (r.sensitiveDx ? "Yes" : "No"),
    },
    {
      key: "chartPrivacy",
      label: "Chart privacy",
      sortable: true,
      align: "right",
      cell: (r) => <PermCell granted={r.chartPrivacy} />,
      sortFn: (a, b) => Number(a.chartPrivacy) - Number(b.chartPrivacy),
      exportValue: (r) => (r.chartPrivacy ? "Yes" : "No"),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Role permission matrix"
      exportable
      exportName="role-matrix"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No roles defined.
        </p>
      }
    />
  );
}
