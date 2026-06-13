"use client";

// Claim cohort table, adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5) and the table can be downloaded or
// printed (G6). Money pre-formatted server-side; raw cents fields ride along
// for correct numeric sort.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface ClaimCohortRow {
  claimPseudonym: string;
  claimShort: string;
  patientPseudonym: string;
  patientShort: string;
  serviceMonth: string;
  payerCategory: string;
  cptCodes: string;
  icd10Codes: string;
  billedDisplay: string;
  billedCents: number;
  paidDisplay: string;
  paidCents: number;
  status: string;
}

export function ClaimCohortTable({ rows }: { rows: ClaimCohortRow[] }) {
  const columns: ColumnDef<ClaimCohortRow>[] = [
    {
      key: "claimShort",
      label: "Claim",
      sortable: true,
      exportValue: (r) => r.claimPseudonym,
    },
    {
      key: "patientShort",
      label: "Patient",
      sortable: true,
      exportValue: (r) => r.patientPseudonym,
    },
    { key: "serviceMonth", label: "Month", sortable: true },
    { key: "payerCategory", label: "Payer", sortable: true },
    { key: "cptCodes", label: "CPTs", sortable: true },
    { key: "icd10Codes", label: "ICD-10", sortable: true },
    {
      key: "billed",
      label: "Billed",
      sortable: true,
      align: "right",
      cell: (r) => r.billedDisplay,
      sortFn: (a, b) => a.billedCents - b.billedCents,
      exportValue: (r) => (r.billedCents / 100).toFixed(2),
    },
    {
      key: "paid",
      label: "Paid",
      sortable: true,
      align: "right",
      cell: (r) => r.paidDisplay,
      sortFn: (a, b) => a.paidCents - b.paidCents,
      exportValue: (r) => (r.paidCents / 100).toFixed(2),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      cell: (r) => (
        <Badge
          tone={
            r.status === "paid"
              ? "success"
              : r.status === "denied"
              ? "danger"
              : "neutral"
          }
        >
          {r.status}
        </Badge>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.claimPseudonym}
      ariaLabel="Claim cohort"
      exportable
      exportName="research-exports-claims"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No claims in the filtered cohort.
        </p>
      }
    />
  );
}
