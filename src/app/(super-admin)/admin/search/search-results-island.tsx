"use client";

// EMR-738 — Client island for the cross-tenant search results table.
//
// Tiny by design: the table rendering and data fetch happen on the
// server; this island only wires up keyboard navigation (j/k to move
// the selected row, Enter to deep-link) and the visual "selected" state.
//
// We deliberately do NOT do the search fetch from this island — the
// page is a server component, the data flows through props, and this
// island stays a thin layer over `<table>`.

import * as React from "react";
import Link from "next/link";

export interface SearchRowLink {
  href: string;
  cells: Array<React.ReactNode>;
}

export function SearchResultsIsland({
  rows,
  columns,
  emptyState,
}: {
  rows: SearchRowLink[];
  columns: string[];
  emptyState: React.ReactNode;
}) {
  const [selected, setSelected] = React.useState(0);

  React.useEffect(() => {
    // Reset selection any time the rows array reference changes (new
    // search). Avoids "selected index out of bounds" flashes when the
    // operator types a different query.
    setSelected(0);
  }, [rows]);

  React.useEffect(() => {
    if (rows.length === 0) return;

    function onKey(e: KeyboardEvent) {
      // Don't hijack keystrokes while the operator is typing in the
      // search input — only the table itself should respond to j/k.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

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
          window.location.href = row.href;
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, selected]);

  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left font-medium text-text-muted"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={`${row.href}-${idx}`}
              className={
                idx === selected
                  ? "bg-accent/30 outline outline-1 outline-accent"
                  : "hover:bg-muted/30"
              }
              onMouseEnter={() => setSelected(idx)}
            >
              {row.cells.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 align-top">
                  {ci === 0 ? (
                    <Link href={row.href} className="block">
                      {cell}
                    </Link>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-xs text-text-muted border-t border-border">
        Navigate with j/k or arrow keys; press Enter to open the selected row.
      </div>
    </div>
  );
}
