"use client";

import { useMemo } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";

export interface ProviderRow {
  id: string;
  name: string;
  specialty: string;
  patientsThisMonth: number;
  notesOnTimePct: number;
  satisfactionNps: number;
  revenue: number;
  agentAcceptance: number;
}

type SortKey =
  | "patientsThisMonth"
  | "notesOnTimePct"
  | "satisfactionNps"
  | "revenue"
  | "agentAcceptance";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "patientsThisMonth", label: "Patients this month" },
  { key: "notesOnTimePct", label: "Notes <24h" },
  { key: "satisfactionNps", label: "Satisfaction (NPS)" },
  { key: "revenue", label: "Revenue" },
  { key: "agentAcceptance", label: "Agent acceptance" },
];

const TROPHIES = ["🥇", "🥈", "🥉"];

function formatCell(key: SortKey, value: number): string {
  if (key === "revenue") return "$" + value.toLocaleString();
  if (key === "notesOnTimePct" || key === "agentAcceptance") return `${value}%`;
  return value.toString();
}

export function LeaderboardView({ rows }: { rows: ProviderRow[] }) {
  // Top-3 per column (independent of current sort) — feeds the trophy
  // glyphs so the visual cue stays anchored to the underlying data, not
  // to whichever column the operator happens to be sorting by.
  const topByColumn = useMemo(() => {
    const result: Record<SortKey, string[]> = {
      patientsThisMonth: [],
      notesOnTimePct: [],
      satisfactionNps: [],
      revenue: [],
      agentAcceptance: [],
    };
    for (const col of COLUMNS) {
      const sorted = [...rows]
        .sort((a, b) => b[col.key] - a[col.key])
        .slice(0, 3)
        .map((r) => r.id);
      result[col.key] = sorted;
    }
    return result;
  }, [rows]);

  // Build column defs against ProviderRow — the primitive picks up the
  // generic so every cell(row) is fully typed.
  const columns: ColumnDef<ProviderRow>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Provider",
        sortable: true,
        sortFn: (a, b) => a.name.localeCompare(b.name),
        cell: (row) => (
          <>
            <p className="font-medium text-text">{row.name}</p>
            <p className="text-xs text-text-subtle">{row.specialty}</p>
          </>
        ),
      },
      ...COLUMNS.map<ColumnDef<ProviderRow>>((col) => ({
        key: col.key,
        label: col.label,
        sortable: true,
        align: "right" as const,
        sortFn: (a, b) => a[col.key] - b[col.key],
        cell: (row) => {
          const topIdx = topByColumn[col.key].indexOf(row.id);
          return (
            <>
              <span
                className={cn(
                  "font-medium",
                  topIdx === 0 && "text-emerald-600",
                )}
              >
                {formatCell(col.key, row[col.key])}
              </span>
              {topIdx >= 0 && (
                <span className="ml-1.5">{TROPHIES[topIdx]}</span>
              )}
            </>
          );
        },
      })),
    ],
    [topByColumn],
  );

  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>All providers</CardTitle>
        <CardDescription>
          Click any column header to sort. 🥇🥈🥉 mark the top 3 in each column.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 sm:px-0">
        <DataTable<ProviderRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          ariaLabel="Provider performance leaderboard"
          className="border-0 rounded-none shadow-none"
          showDensityToggle
        />
      </CardContent>
    </Card>
  );
}
