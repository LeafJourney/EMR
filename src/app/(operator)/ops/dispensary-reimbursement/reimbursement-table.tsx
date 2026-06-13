"use client";

// Dispensary reimbursement table, adopted onto the shared <DataTable> primitive
// so every column header sorts (MASTER prompt G5) and the whole table can be
// downloaded or printed (G6). Money is pre-formatted server-side and passed as
// display strings; the numeric *cents* fields ride along purely so the columns
// sort by real magnitude rather than by the formatted string.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface ReimbursementRow {
  id: string;
  patientName: string;
  dispensaryName: string;
  serviceMonthDisplay: string;
  serviceMonthMs: number;
  spendDisplay: string;
  spendCents: number;
  reimbursableDisplay: string;
  reimbursableCents: number;
  status: string;
  statusTone: "success" | "warning" | "accent" | "neutral";
}

export function ReimbursementTable({ rows }: { rows: ReimbursementRow[] }) {
  const columns: ColumnDef<ReimbursementRow>[] = [
    { key: "patientName", label: "Patient", sortable: true },
    { key: "dispensaryName", label: "Dispensary", sortable: true },
    {
      key: "serviceMonth",
      label: "Service month",
      sortable: true,
      cell: (r) => r.serviceMonthDisplay,
      sortFn: (a, b) => a.serviceMonthMs - b.serviceMonthMs,
      exportValue: (r) => r.serviceMonthDisplay,
    },
    {
      key: "spend",
      label: "Spend",
      sortable: true,
      align: "right",
      cell: (r) => r.spendDisplay,
      sortFn: (a, b) => a.spendCents - b.spendCents,
      exportValue: (r) => (r.spendCents / 100).toFixed(2),
    },
    {
      key: "reimbursable",
      label: "Reimbursable",
      sortable: true,
      align: "right",
      cell: (r) => r.reimbursableDisplay,
      sortFn: (a, b) => a.reimbursableCents - b.reimbursableCents,
      exportValue: (r) => (r.reimbursableCents / 100).toFixed(2),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      cell: (r) => <Badge tone={r.statusTone}>{r.status}</Badge>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Reimbursement records"
      exportable
      exportName="dispensary-reimbursement"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No reimbursement records yet.
        </p>
      }
    />
  );
}
