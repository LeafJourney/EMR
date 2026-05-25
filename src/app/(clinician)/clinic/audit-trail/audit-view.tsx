"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";
import { PatientHoverCard, ProviderHoverCard } from "@/components/preview";

// ─── Types ──────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorAgent: string | null;
  actorName: string;
  action: string;
  subjectType: string | null;
  subjectId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditTrailViewProps {
  initialLogs: AuditLogEntry[];
  totalCount: number;
}

// ─── Helpers ────────────────────────────────────────────

function getActionTone(action: string): "success" | "warning" | "danger" | "neutral" {
  if (action.includes("read") || action.includes("view") || action.includes("list")) {
    return "success";
  }
  if (action.includes("delete") || action.includes("remove") || action.includes("revoke")) {
    return "danger";
  }
  if (
    action.includes("create") ||
    action.includes("update") ||
    action.includes("write") ||
    action.includes("finalize") ||
    action.includes("sign")
  ) {
    return "warning";
  }
  return "neutral";
}

function getActionLeaf(action: string): string {
  const tone = getActionTone(action);
  switch (tone) {
    case "success":
      return "🌿";
    case "warning":
      return "🌱";
    case "danger":
      return "🍂";
    default:
      return "🍃";
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function toCSV(logs: AuditLogEntry[]): string {
  const headers = ["Timestamp", "Actor", "Action", "Subject Type", "Subject ID", "Metadata"];
  const rows = logs.map((log) => [
    log.createdAt,
    log.actorName,
    log.action,
    log.subjectType ?? "",
    log.subjectId ?? "",
    log.metadata ? JSON.stringify(log.metadata) : "",
  ]);
  return [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

// ─── Main Component ─────────────────────────────────────

export function AuditTrailView({
  initialLogs,
  totalCount,
}: AuditTrailViewProps) {
  const [logs] = useState(initialLogs);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  const perPage = 20;

  // ─── Filtering ──────────────────────────────────

  const filteredLogs = useMemo(() => {
    let result = logs;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.actorName.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          (log.subjectType?.toLowerCase().includes(q) ?? false) ||
          (log.subjectId?.toLowerCase().includes(q) ?? false),
      );
    }

    if (actionFilter) {
      const af = actionFilter.toLowerCase();
      result = result.filter((log) => log.action.toLowerCase().includes(af));
    }

    if (subjectFilter) {
      const sf = subjectFilter.toLowerCase();
      result = result.filter(
        (log) => log.subjectType?.toLowerCase().includes(sf) ?? false,
      );
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((log) => new Date(log.createdAt).getTime() >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86_400_000; // end of day
      result = result.filter((log) => new Date(log.createdAt).getTime() <= to);
    }

    return result;
  }, [logs, searchQuery, actionFilter, subjectFilter, dateFrom, dateTo]);

  // ─── Pagination ─────────────────────────────────

  const totalPages = Math.ceil(filteredLogs.length / perPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage,
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExportCSV = useCallback(() => {
    const csv = toCSV(filteredLogs);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-10">
        <div className="max-w-2xl">
          <Eyebrow className="mb-3">Compliance</Eyebrow>
          <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            Audit trail
          </h1>
          <p className="text-[15px] text-text-muted mt-3 leading-relaxed">
            Complete log of all actions performed across the platform.{" "}
            <span className="tabular-nums font-medium text-text">
              {totalCount.toLocaleString()}
            </span>{" "}
            total entries.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={handleExportCSV}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="mr-1"
            >
              <path
                d="M7 1v9M3 6l4 4 4-4M2 12h10"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card tone="raised" className="mb-6">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] text-text-subtle uppercase tracking-wider mb-1 block">
                Search
              </label>
              <Input
                placeholder="User, action, subject..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <label className="text-[10px] text-text-subtle uppercase tracking-wider mb-1 block">
                Action
              </label>
              <Input
                placeholder="e.g. note.finalized"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <label className="text-[10px] text-text-subtle uppercase tracking-wider mb-1 block">
                Subject type
              </label>
              <Input
                placeholder="e.g. patient, note"
                value={subjectFilter}
                onChange={(e) => {
                  setSubjectFilter(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div>
              <label className="text-[10px] text-text-subtle uppercase tracking-wider mb-1 block">
                From
              </label>
              <DatePicker
                value={dateFrom}
                onChange={(v) => {
                  setDateFrom(v);
                  setCurrentPage(1);
                }}
                placeholder="From date"
                max={dateTo || undefined}
              />
            </div>
            <div>
              <label className="text-[10px] text-text-subtle uppercase tracking-wider mb-1 block">
                To
              </label>
              <DatePicker
                value={dateTo}
                onChange={(v) => {
                  setDateTo(v);
                  setCurrentPage(1);
                }}
                placeholder="To date"
                min={dateFrom || undefined}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card tone="raised">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider w-8" />
                  <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider">
                    Actor
                  </th>
                  <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider">
                    Action
                  </th>
                  <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginatedLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-12 text-center text-text-muted"
                    >
                      No audit log entries found.
                    </td>
                  </tr>
                ) : (
                  paginatedLogs.map((log) => {
                    const isExpanded = expandedRows.has(log.id);
                    const actionTone = getActionTone(log.action);
                    const isAgent = !!log.actorAgent;

                    return (
                      <tr key={log.id} className="group">
                        <td className="py-3 px-5" colSpan={6}>
                          <div className="flex items-start gap-4">
                            {/* Expand button */}
                            <button
                              onClick={() => toggleExpand(log.id)}
                              className="mt-0.5 shrink-0 h-5 w-5 rounded flex items-center justify-center hover:bg-surface-muted transition-colors"
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 12 12"
                                fill="none"
                                className={cn(
                                  "text-text-subtle transition-transform duration-200",
                                  isExpanded && "rotate-90",
                                )}
                              >
                                <path
                                  d="M4 2l4 4-4 4"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>

                            {/* Action leaf */}
                            <span
                              aria-hidden="true"
                              className="mt-0.5 text-[11px] leading-none shrink-0"
                            >
                              {getActionLeaf(log.action)}
                            </span>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center flex-wrap gap-x-6 gap-y-1">
                                {/* Timestamp */}
                                <span className="text-xs text-text-muted tabular-nums shrink-0">
                                  {formatTimestamp(log.createdAt)}
                                </span>

                                {/* Actor */}
                                <span className="text-sm text-text shrink-0">
                                  {isAgent ? (
                                    <span className="font-mono text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                                      {log.actorAgent}
                                    </span>
                                  ) : log.actorUserId ? (
                                    <ProviderHoverCard userId={log.actorUserId}>
                                      <span className="font-medium cursor-default">
                                        {log.actorName}
                                      </span>
                                    </ProviderHoverCard>
                                  ) : (
                                    <span className="font-medium">
                                      {log.actorName}
                                    </span>
                                  )}
                                </span>

                                {/* Action */}
                                <Badge
                                  tone={actionTone}
                                  className="text-[10px]"
                                >
                                  {log.action}
                                </Badge>

                                {/* Subject */}
                                {log.subjectType && (
                                  <span className="text-xs text-text-muted">
                                    <span className="font-medium text-text-subtle">
                                      {log.subjectType}
                                    </span>
                                    {log.subjectId &&
                                    log.subjectType.toLowerCase() === "patient" ? (
                                      <PatientHoverCard patientId={log.subjectId}>
                                        <span className="font-mono text-[10px] ml-1 cursor-default underline-offset-2 hover:underline">
                                          {log.subjectId.slice(0, 12)}
                                        </span>
                                      </PatientHoverCard>
                                    ) : log.subjectId ? (
                                      <span className="font-mono text-[10px] ml-1">
                                        {log.subjectId.slice(0, 12)}
                                      </span>
                                    ) : null}
                                  </span>
                                )}
                              </div>

                              {/* Expanded metadata */}
                              {isExpanded && log.metadata && (
                                <div className="mt-3 p-3 rounded-lg bg-surface-muted border border-border/60 overflow-x-auto">
                                  <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">
                                    Metadata
                                  </p>
                                  <pre className="text-xs text-text-muted font-mono whitespace-pre-wrap break-all leading-relaxed">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {isExpanded && !log.metadata && (
                                <div className="mt-3 p-3 rounded-lg bg-surface-muted border border-border/60">
                                  <p className="text-xs text-text-muted">
                                    No additional metadata.
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-border/60 flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Showing {(currentPage - 1) * perPage + 1}
              {" - "}
              {Math.min(currentPage * perPage, filteredLogs.length)} of{" "}
              {filteredLogs.length} entries
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const page = i + 1;
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "h-8 w-8 rounded-md text-sm transition-colors",
                      currentPage === page
                        ? "bg-accent text-white font-medium"
                        : "text-text-muted hover:bg-surface-muted",
                    )}
                  >
                    {page}
                  </button>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Legend */}
      <div className="mt-6 flex items-center gap-6 text-xs text-text-muted">
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true">🌿</span>
          Reads
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true">🌱</span>
          Writes
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true">🍂</span>
          Deletes
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden="true">🍃</span>
          Other
        </div>
      </div>
    </div>
  );
}
