"use client";

// Stored payment methods list, adopted onto the shared <DataTable> primitive
// so every column header sorts (MASTER prompt G5 / EMR-1018) and the whole
// table can be downloaded or printed (G6). Dates are pre-formatted
// server-side; numeric sort fields ride along for real-magnitude ordering.

import Link from "next/link";
import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";

export interface PaymentMethodRow {
  id: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  type: "card" | "ach" | string;
  brand: string | null;
  last4: string | null;
  expiresDisplay: string;
  /** expiryYear * 100 + expiryMonth, or 0 when absent — used for sort only */
  expiresOrdinal: number;
  savedDisplay: string;
  savedMs: number;
  isDefault: boolean;
}

export function PaymentMethodsTable({ rows }: { rows: PaymentMethodRow[] }) {
  const columns: ColumnDef<PaymentMethodRow>[] = [
    {
      key: "patient",
      label: "Patient",
      sortable: true,
      sortFn: (a, b) =>
        `${a.patientLastName} ${a.patientFirstName}`.localeCompare(
          `${b.patientLastName} ${b.patientFirstName}`
        ),
      cell: (r) => (
        <Link
          href={`/clinic/patients/${r.patientId}`}
          className="flex items-center gap-2 group"
        >
          <Avatar firstName={r.patientFirstName} lastName={r.patientLastName} size="sm" />
          <span className="font-medium text-text group-hover:text-accent transition-colors">
            {r.patientFirstName} {r.patientLastName}
          </span>
        </Link>
      ),
      exportValue: (r) => `${r.patientFirstName} ${r.patientLastName}`,
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      cell: (r) => (
        <Badge tone={r.type === "card" ? "accent" : "info"}>
          {r.type.toUpperCase()}
        </Badge>
      ),
      exportValue: (r) => r.type.toUpperCase(),
    },
    {
      key: "brand",
      label: "Brand",
      sortable: true,
      cell: (r) => r.brand ?? "—",
      exportValue: (r) => r.brand ?? "",
    },
    {
      key: "last4",
      label: "Last 4",
      sortable: true,
      cell: (r) => (r.last4 ? `•••• ${r.last4}` : "—"),
      exportValue: (r) => r.last4 ?? "",
    },
    {
      key: "expires",
      label: "Expires",
      sortable: true,
      cell: (r) => r.expiresDisplay,
      sortFn: (a, b) => a.expiresOrdinal - b.expiresOrdinal,
      exportValue: (r) => r.expiresDisplay,
    },
    {
      key: "saved",
      label: "Saved",
      sortable: true,
      cell: (r) => r.savedDisplay,
      sortFn: (a, b) => a.savedMs - b.savedMs,
      exportValue: (r) => r.savedDisplay,
    },
    {
      key: "isDefault",
      label: "Default",
      sortable: true,
      sortFn: (a, b) => Number(b.isDefault) - Number(a.isDefault),
      cell: (r) =>
        r.isDefault ? <Badge tone="success">Default</Badge> : null,
      exportValue: (r) => (r.isDefault ? "Yes" : ""),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Stored payment methods"
      exportable
      exportName="payment-methods"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No stored methods yet — patients can save a card or bank account from
          the portal billing tab.
        </p>
      }
    />
  );
}
