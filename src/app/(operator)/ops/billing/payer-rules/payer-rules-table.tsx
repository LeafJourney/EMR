"use client";

// Payer rules table, adopted onto the shared <DataTable> primitive so every
// column header sorts (MASTER prompt G5 / EMR-218) and the whole table can be
// downloaded or printed (G6). Dates are pre-formatted server-side and passed
// as display strings; raw epoch-ms fields ride along for sort fidelity.

import Link from "next/link";
import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";

export interface PayerRuleRow {
  id: string;
  displayName: string;
  class: string;
  timelyFilingDisplay: string;
  timelyFilingDays: number;
  correctedTimelyFilingDays: number;
  ackSlaDays: number;
  cannabisLabel: "Excluded" | "Prior auth" | "Covered";
  lastReviewedDisplay: string;
  lastReviewedMs: number;
  isStale: boolean;
  isOrgOverride: boolean;
}

const CANNABIS_TONE = {
  Excluded: "danger",
  "Prior auth": "warning",
  Covered: "success",
} as const;

export function PayerRulesTable({ rows }: { rows: PayerRuleRow[] }) {
  const columns: ColumnDef<PayerRuleRow>[] = [
    {
      key: "displayName",
      label: "Payer",
      sortable: true,
      cell: (r) => <span className="font-medium">{r.displayName}</span>,
    },
    {
      key: "class",
      label: "Class",
      sortable: true,
    },
    {
      key: "timelyFiling",
      label: "Timely filing",
      sortable: true,
      cell: (r) => r.timelyFilingDisplay,
      sortFn: (a, b) => a.timelyFilingDays - b.timelyFilingDays,
      exportValue: (r) => r.timelyFilingDisplay,
    },
    {
      key: "ackSlaDays",
      label: "Ack SLA",
      sortable: true,
      align: "right",
      cell: (r) => `${r.ackSlaDays}d`,
      sortFn: (a, b) => a.ackSlaDays - b.ackSlaDays,
      exportValue: (r) => r.ackSlaDays,
    },
    {
      key: "cannabis",
      label: "Cannabis",
      sortable: true,
      cell: (r) => (
        <Badge tone={CANNABIS_TONE[r.cannabisLabel]}>{r.cannabisLabel}</Badge>
      ),
      sortFn: (a, b) => a.cannabisLabel.localeCompare(b.cannabisLabel),
      exportValue: (r) => r.cannabisLabel,
    },
    {
      key: "lastReviewed",
      label: "Last reviewed",
      sortable: true,
      cell: (r) =>
        r.isStale ? (
          <Badge tone="warning">{r.lastReviewedDisplay} · stale</Badge>
        ) : (
          r.lastReviewedDisplay
        ),
      sortFn: (a, b) => a.lastReviewedMs - b.lastReviewedMs,
      exportValue: (r) => r.lastReviewedDisplay,
    },
    {
      key: "source",
      label: "Source",
      sortable: true,
      cell: (r) =>
        r.isOrgOverride ? (
          <Badge tone="accent">Org override</Badge>
        ) : (
          <span className="text-text-muted">Global</span>
        ),
      sortFn: (a, b) => Number(a.isOrgOverride) - Number(b.isOrgOverride),
      exportValue: (r) => (r.isOrgOverride ? "Org override" : "Global"),
    },
    {
      key: "edit",
      label: "",
      sortable: false,
      exportable: false,
      width: "80px",
      cell: (r) => (
        <Link
          href={`/ops/billing/payer-rules/editor?id=${encodeURIComponent(r.id)}`}
          className="text-accent hover:underline text-xs"
        >
          edit →
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      ariaLabel="Payer rules"
      exportable
      exportName="payer-rules"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No payer rules configured yet.
        </p>
      }
    />
  );
}
