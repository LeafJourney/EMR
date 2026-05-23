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
//
// We deliberately keep the table markup itself on the server — this
// island just adorns the existing rows with focus/expand state and
// keyboard wiring. The server renders one tbody-per-row (an "expand"
// row below each data row) so toggling never round-trips.

import * as React from "react";
import {
  useContextMenu,
  ContextMenuIcons,
  type ContextMenuItem,
} from "@/components/ui/context-menu";

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

  // Reset focus when the row set identity changes (new filter applied).
  // Avoids stale "selected" index pointing past the end of a narrower
  // result set.
  React.useEffect(() => {
    setSelected(0);
    setExpanded({});
  }, [rows]);

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
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected, toggleExpanded]);

  if (rows.length === 0) return <>{emptyState}</>;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
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
              <AuditTableRow
                key={row.id}
                row={row}
                isSelected={isSelected}
                isExpanded={isExpanded}
                onSelect={() => setSelected(idx)}
                onToggleExpand={() => toggleExpanded(row.id)}
              />
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 text-xs text-text-muted border-t border-border">
        Navigate with j/k (or arrow keys); Enter expands the focused row;
        click the timestamp to open the row&apos;s detail page;
        &quot;/&quot; jumps to the action filter. Right-click any row for
        quick actions (copy JSON, filter by actor/action).
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuditTableRow — extracted into its own component so each row can host a
// right-click context menu (Monday/Linear-tier). The `useContextMenu`
// hook can't be called inside `.map(...)`, so we pay one mount per row.
// ---------------------------------------------------------------------------

function buildAuditQS(updates: Record<string, string | null>) {
  // Read the current URL's params and merge, dropping anything set to
  // null. Falls back to the empty string when not running in a browser
  // (the menu is only ever invoked client-side anyway).
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(updates)) {
    if (v == null) params.delete(k);
    else params.set(k, v);
  }
  // Cursor pagination resets when filters change — drop the cursor so
  // the operator lands on page 1 of the new filter set.
  params.delete("cursor");
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

function AuditTableRow({
  row,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
}: {
  row: AuditRowView;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}) {
  const items: ContextMenuItem[] = [
    {
      label: "Open detail",
      icon: ContextMenuIcons.Open,
      onSelect: (c) => {
        window.location.assign(row.detailHref);
        c();
      },
      kbd: "↵",
    },
    {
      label: "Copy row JSON",
      icon: ContextMenuIcons.Copy,
      onSelect: (c) => {
        try {
          void navigator.clipboard?.writeText(row.metadataFullJson);
        } catch {
          /* ignore */
        }
        c();
      },
      kbd: "⌘ C",
    },
    { divider: true, label: "" },
    {
      label: `Filter by actor (${row.actorLabel})`,
      icon: ContextMenuIcons.User,
      onSelect: (c) => {
        window.location.assign(buildAuditQS({ actor: row.actorLabel }));
        c();
      },
    },
    {
      label: `Filter by action (${row.action})`,
      icon: ContextMenuIcons.Filter,
      onSelect: (c) => {
        window.location.assign(buildAuditQS({ action: row.action }));
        c();
      },
    },
  ];
  const ctx = useContextMenu(() => items);

  return (
    <React.Fragment>
      <tr
        className={
          isSelected
            ? "bg-accent/30 outline outline-1 outline-accent"
            : "hover:bg-muted/30"
        }
        onMouseEnter={onSelect}
        onClick={onToggleExpand}
        onContextMenu={ctx.triggerProps.onContextMenu}
        onTouchStart={ctx.triggerProps.onTouchStart}
        onTouchEnd={ctx.triggerProps.onTouchEnd}
        onTouchMove={ctx.triggerProps.onTouchMove}
      >
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
        <td className="px-3 py-2 align-top font-mono text-xs">{row.action}</td>
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
              onToggleExpand();
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
          <td colSpan={6} className="px-3 py-3">
            <pre className="whitespace-pre-wrap break-all text-xs font-mono text-text-muted">
              {row.metadataFullJson}
            </pre>
          </td>
        </tr>
      )}
      {ctx.menu}
    </React.Fragment>
  );
}
