"use client";

// Click analytics by role, adopted onto the shared <DataTable> primitive so
// every column header sorts (MASTER prompt G5 / EMR-1018) and the table can
// be downloaded or printed (G6). Numeric fields (sessionCount,
// avgClicksPerSession, avgSessionSeconds) ride along so columns sort by real
// magnitude rather than display string.

import { DataTable, type ColumnDef } from "@/components/ops/master";
import { Badge } from "@/components/ui/badge";
import type { AccessRole } from "@/lib/billing/access-log";

const ROLE_TONE: Record<
  AccessRole,
  "highlight" | "accent" | "info" | "success" | "warning" | "neutral"
> = {
  patient: "info",
  provider: "highlight",
  office_manager: "accent",
  researcher: "success",
  system: "neutral",
};

export interface RoleAnalyticsRow {
  role: AccessRole;
  sessionCount: number;
  avgClicksDisplay: string;
  avgClicks: number;
  avgSessionDisplay: string;
  avgSessionSeconds: number;
  topDestinationsDisplay: string;
}

export function RoleAnalyticsTable({ rows }: { rows: RoleAnalyticsRow[] }) {
  const columns: ColumnDef<RoleAnalyticsRow>[] = [
    {
      key: "role",
      label: "Role",
      sortable: true,
      cell: (r) => (
        <Badge tone={ROLE_TONE[r.role]}>{r.role}</Badge>
      ),
    },
    {
      key: "sessionCount",
      label: "Sessions",
      sortable: true,
      align: "right",
      cell: (r) => r.sessionCount,
      sortFn: (a, b) => a.sessionCount - b.sessionCount,
      exportValue: (r) => String(r.sessionCount),
    },
    {
      key: "avgClicks",
      label: "Avg clicks",
      sortable: true,
      align: "right",
      cell: (r) => r.avgClicksDisplay,
      sortFn: (a, b) => a.avgClicks - b.avgClicks,
      exportValue: (r) => r.avgClicks.toFixed(1),
    },
    {
      key: "avgSession",
      label: "Avg session",
      sortable: true,
      align: "right",
      cell: (r) => r.avgSessionDisplay,
      sortFn: (a, b) => a.avgSessionSeconds - b.avgSessionSeconds,
      exportValue: (r) => r.avgSessionSeconds.toFixed(0),
    },
    {
      key: "topDestinationsDisplay",
      label: "Top destinations",
      sortable: true,
      cell: (r) => (
        <span className="text-xs text-text-muted">{r.topDestinationsDisplay || "—"}</span>
      ),
      exportValue: (r) => r.topDestinationsDisplay,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.role}
      ariaLabel="Click analytics by role"
      exportable
      exportName="access-log-role-analytics"
      emptyState={
        <p className="py-6 text-center text-text-subtle italic">
          No sessions in this window — adjust the days filter or wait for activity.
        </p>
      }
    />
  );
}
