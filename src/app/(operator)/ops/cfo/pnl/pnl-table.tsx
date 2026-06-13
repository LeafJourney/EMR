"use client";

// P&L period comparison table, adopted onto the shared <DataTable> primitive so
// every column header sorts (MASTER prompt G5 / EMR-1018) and the table can be
// downloaded or printed (G6). Money amounts are pre-formatted server-side and
// passed as display strings; raw cents fields ride along for correct numeric sort.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface PnlRow {
  id: string;
  line: string;
  currentDisplay: string;
  currentCents: number;
  priorDisplay: string;
  priorCents: number;
  deltaDisplay: string;
  deltaCents: number;
  badgeTone: "success" | "danger" | "neutral";
  badgeText: string;
  periodLabel: string;
  priorPeriodLabel: string;
}

export function PnlTable({
  rows,
  periodLabel,
  priorPeriodLabel,
}: {
  rows: PnlRow[];
  periodLabel: string;
  priorPeriodLabel: string;
}) {
  const columns: ColumnDef<PnlRow>[] = [
    { key: "line", label: "Line", sortable: true },
    {
      key: "current",
      label: `This ${periodLabel}`,
      sortable: true,
      align: "right",
      cell: (r) => r.currentDisplay,
      sortFn: (a, b) => a.currentCents - b.currentCents,
      exportValue: (r) => (r.currentCents / 100).toFixed(2),
    },
    {
      key: "prior",
      label: `Prior ${priorPeriodLabel}`,
      sortable: true,
      align: "right",
      cell: (r) => <span className="text-text-muted">{r.priorDisplay}</span>,
      sortFn: (a, b) => a.priorCents - b.priorCents,
      exportValue: (r) => (r.priorCents / 100).toFixed(2),
    },
    {
      key: "delta",
      label: "Δ",
      sortable: true,
      align: "right",
      cell: (r) => (
        <Badge tone={r.badgeTone} className="text-[10px]">
          {r.badgeText}
        </Badge>
      ),
      sortFn: (a, b) => a.deltaCents - b.deltaCents,
      exportValue: (r) => r.badgeText,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="P&L period comparison"
      exportable
      exportName="pnl-period-comparison"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No P&L data for this period.
        </p>
      }
    />
  );
}
