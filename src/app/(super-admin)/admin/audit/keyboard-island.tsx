"use client";

// EMR-747 — Client island for the audit log table.
//
// Mirrors search-results-island.tsx in spirit but does more, because the
// audit table has expandable rows. Responsibilities:
//
//   - j/k (or ArrowDown/ArrowUp) move row focus
//   - Enter toggles the focused row's expanded metadata
//   - "/" focuses the action filter input (id="audit-filter-action")
//   - per-row expanded JSON renders verbatim (super-admin only surface)
//   - bulk select via checkbox column; ⌘/Ctrl+A select-all-visible;
//     Shift+Click range-select; BulkActionBar at the bottom for
//     "Export selected" + "Mark reviewed".
//
// We deliberately keep the table markup itself on the server — this
// island just adorns the existing rows with focus/expand state and
// keyboard wiring. The server renders one tbody-per-row (an "expand"
// row below each data row) so toggling never round-trips.

import * as React from "react";
import { BulkActionBar, useBulkSelection } from "@/components/ui/bulk-action-bar";
import { useToast } from "@/components/ui/toast";
import {
  bulkMarkAuditReviewedAction,
  bulkExportAuditRowsAction,
} from "./bulk-actions";

export interface AuditRowView {
  id: string;
  at: string;
  atRelative: string;
  /** Drill-in path for this row (/admin/audit/[id]). */
  detailHref: string;
  actorLabel: string;
  actorHref: string | null;
  action: string;
  subjectLabel: string;
  subjectHref: string | null;
  targetLabel: string;
  targetHref: string | null;
  metadataPreview: string;
  metadataFullJson: string;
}

const ACTION_FILTER_INPUT_ID = "audit-filter-action";

export function AuditTableIsland({
  rows,
  emptyState,
}: {
  rows: AuditRowView[];
  emptyState: React.ReactNode;
}) {
  const [selected, setSelected] = React.useState(0);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  // Bulk-multiselect state — checkbox column drives this, the action
  // bar at the bottom consumes the same Set.
  const bulk = useBulkSelection<string>();
  const { toast } = useToast();
  const lastClickedRef = React.useRef<string | null>(null);
  const [bulkPending, setBulkPending] = React.useState<string | null>(null);
  const visibleIds = React.useMemo(() => rows.map((r) => r.id), [rows]);

  // Reset focus when the row set identity changes (new filter applied).
  // Avoids stale "selected" index pointing past the end of a narrower
  // result set.
  React.useEffect(() => {
    setSelected(0);
    setExpanded({});
    bulk.clear();
    lastClickedRef.current = null;
    // bulk is stable for this purpose; we only want to clear when rows
    // change identity (the new filter context resets the result set).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Bulk handlers — keep them inline; the surface is tiny.
  const handleMarkReviewed = React.useCallback(async () => {
    setBulkPending("review");
    const res = await bulkMarkAuditReviewedAction({ ids: bulk.asArray });
    setBulkPending(null);
    if (!res.ok) {
      toast({ title: "Mark reviewed failed", description: res.error, variant: "error" });
      return;
    }
    toast({
      title: `Marked ${res.count} row${res.count === 1 ? "" : "s"} reviewed`,
      variant: "success",
    });
    bulk.clear();
  }, [bulk, toast]);

  const handleExportSelected = React.useCallback(async () => {
    setBulkPending("export");
    const res = await bulkExportAuditRowsAction({ ids: bulk.asArray });
    setBulkPending(null);
    if (!res.ok) {
      toast({ title: "Export failed", description: res.error, variant: "error" });
      return;
    }
    const header = [
      "id",
      "at",
      "actor",
      "action",
      "subjectType",
      "subjectId",
      "organization",
      "reason",
    ];
    const escape = (v: string | null) =>
      v == null
        ? ""
        : /[",\n]/.test(v)
          ? `"${v.replace(/"/g, '""')}"`
          : v;
    const lines = [header.join(",")];
    for (const r of res.rows) {
      lines.push(
        [
          r.id,
          r.at,
          r.actor,
          r.action,
          r.subjectType,
          r.subjectId,
          r.organization,
          r.reason,
        ]
          .map((x) => escape(x as string | null))
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: `Exported ${res.rows.length} row${res.rows.length === 1 ? "" : "s"}`,
      variant: "success",
    });
  }, [bulk.asArray, toast]);

  const handleRowCheck = React.useCallback(
    (id: string, shift?: boolean) => {
      if (shift) {
        bulk.selectRange(visibleIds, lastClickedRef.current, id);
      } else {
        bulk.toggle(id);
      }
      lastClickedRef.current = id;
    },
    [bulk, visibleIds],
  );

  const toggleExpanded = React.useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  React.useEffect(() => {
    if (rows.length === 0) return;

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // "/" focuses the action filter from anywhere. Honour the convention
      // most editors and Gmail/Linear use: focus the filter, prevent
      // default so the literal slash never lands in the field.
      if (e.key === "/" && !inField) {
        const el = document.getElementById(ACTION_FILTER_INPUT_ID) as
          | HTMLInputElement
          | null;
        if (el) {
          e.preventDefault();
          el.focus();
          el.select();
        }
        return;
      }

      if (inField) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(rows.length - 1, s + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(0, s - 1));
      } else if (e.key === "Enter") {
        const row = rows[selected];
        if (row) {
          e.preventDefault();
          toggleExpanded(row.id);
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        // ⌘/Ctrl+A — select every currently-visible audit row.
        e.preventDefault();
        bulk.setAllVisible(visibleIds);
      } else if (e.key === "Escape" && bulk.size > 0) {
        bulk.clear();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, toggleExpanded, bulk, visibleIds]);

  if (rows.length === 0) return <>{emptyState}</>;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 w-8 text-left font-medium text-text-muted">
              {/* Tri-state "select all visible" header checkbox. */}
              <input
                ref={(el) => {
                  if (el)
                    el.indeterminate = bulk.size > 0 && bulk.size < rows.length;
                }}
                type="checkbox"
                checked={bulk.size === rows.length && rows.length > 0}
                onChange={(e) => {
                  if (e.target.checked) bulk.setAllVisible(visibleIds);
                  else bulk.clear();
                }}
                aria-label="Select all visible audit rows"
                className="h-4 w-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              />
            </th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">Time</th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">Actor</th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">Action</th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">Subject</th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">Target</th>
            <th className="px-3 py-2 text-left font-medium text-text-muted">Metadata</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isSelected = idx === selected;
            const isExpanded = !!expanded[row.id];
            return (
              <React.Fragment key={row.id}>
                <tr
                  className={
                    isSelected
                      ? "bg-accent/30 outline outline-1 outline-accent"
                      : bulk.has(row.id)
                        ? "bg-accent-soft/40"
                        : "hover:bg-muted/30"
                  }
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => toggleExpanded(row.id)}
                >
                  <td className="px-3 py-2 align-top w-8">
                    <input
                      type="checkbox"
                      checked={bulk.has(row.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleRowCheck(
                          row.id,
                          (e.nativeEvent as MouseEvent | undefined)?.shiftKey,
                        );
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select audit row ${row.id}`}
                      className="h-4 w-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    />
                  </td>
                  <td className="px-3 py-2 align-top" title={row.at}>
                    <a
                      href={row.detailHref}
                      className="text-accent underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.atRelative}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.actorHref ? (
                      <a
                        href={row.actorHref}
                        className="text-accent underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.actorLabel}
                      </a>
                    ) : (
                      row.actorLabel
                    )}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-xs">
                    {row.action}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.subjectHref ? (
                      <a
                        href={row.subjectHref}
                        className="text-accent underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.subjectLabel}
                      </a>
                    ) : (
                      row.subjectLabel
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.targetHref ? (
                      <a
                        href={row.targetHref}
                        className="text-accent underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.targetLabel}
                      </a>
                    ) : (
                      row.targetLabel
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <button
                      type="button"
                      className="text-left text-xs text-text-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(row.id);
                      }}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? "▾ Collapse" : "▸ "}{" "}
                      {!isExpanded && (
                        <span className="font-mono">{row.metadataPreview || "—"}</span>
                      )}
                    </button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="bg-muted/20">
                    <td colSpan={7} className="px-3 py-3">
                      <pre className="whitespace-pre-wrap break-all text-xs font-mono text-text-muted">
                        {row.metadataFullJson}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 text-xs text-text-muted border-t border-border">
        Navigate with j/k (or arrow keys); Enter expands the focused row;
        click the timestamp to open the row&apos;s detail page;
        &quot;/&quot; jumps to the action filter;{" "}
        <kbd className="font-mono">⌘A</kbd> selects every visible row.
      </div>

      <BulkActionBar
        count={bulk.size}
        onClear={bulk.clear}
        itemNoun="row"
        ariaLabel="Audit log bulk actions"
        actions={[
          {
            key: "export",
            label: "Export selected",
            onClick: handleExportSelected,
            isPending: bulkPending === "export",
          },
          {
            key: "review",
            label: "Mark reviewed",
            onClick: handleMarkReviewed,
            isPending: bulkPending === "review",
          },
        ]}
      />
    </div>
  );
}
