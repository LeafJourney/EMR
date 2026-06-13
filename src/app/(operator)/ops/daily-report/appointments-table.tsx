"use client";

// Appointments list, adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5) and the table can be downloaded or
// printed (G6).  Status uses the same colour tokens as the original inline
// span; a raw statusKey field lets the column sort alphabetically by status
// value.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { cn } from "@/lib/utils/cn";

const STATUS_TONE: Record<string, { label: string; bg: string; text: string }> = {
  completed:   { label: "Completed",   bg: "bg-emerald-50", text: "text-emerald-700" },
  in_progress: { label: "In progress", bg: "bg-blue-50",    text: "text-blue-700"    },
  no_show:     { label: "No-show",     bg: "bg-red-50",     text: "text-red-700"     },
  cancelled:   { label: "Cancelled",   bg: "bg-gray-100",   text: "text-gray-600"    },
};

export interface AppointmentRow {
  id: string;
  time: string;
  patient: string;
  provider: string;
  /** Raw status key — used as the sort field and for colour lookup */
  statusKey: string;
  /** Display label produced from statusKey */
  statusLabel: string;
  /** Modality display string (underscores replaced with dashes) */
  modalityDisplay: string;
  /** Raw modality key — used for CSV export */
  modalityKey: string;
}

const columns: ColumnDef<AppointmentRow>[] = [
  { key: "time",     label: "Time",     sortable: true },
  { key: "patient",  label: "Patient",  sortable: true },
  { key: "provider", label: "Provider", sortable: true },
  {
    key: "statusKey",
    label: "Status",
    sortable: true,
    cell: (r) => {
      const tone = STATUS_TONE[r.statusKey] ?? { label: r.statusLabel, bg: "bg-gray-100", text: "text-gray-600" };
      return (
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
            tone.bg,
            tone.text,
          )}
        >
          {tone.label}
        </span>
      );
    },
    exportValue: (r) => r.statusLabel,
  },
  {
    key: "modalityDisplay",
    label: "Modality",
    sortable: true,
    sortFn: (a, b) => a.modalityKey.localeCompare(b.modalityKey),
    exportValue: (r) => r.modalityKey,
  },
];

export function AppointmentsTable({ rows }: { rows: AppointmentRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Appointments"
      exportable
      exportName="appointments"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No appointments for this date.
        </p>
      }
    />
  );
}
