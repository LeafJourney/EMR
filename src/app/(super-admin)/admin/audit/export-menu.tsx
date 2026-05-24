"use client";

// Export-menu island for the super-admin audit log header.
//
// Replaces the single "Export CSV" link with a "Export…" button that
// opens a small dropdown offering CSV and PDF. Both options honor the
// active filter query string (passed in by the server component) so
// downloads are scoped to whatever the operator is looking at on
// screen.
//
// Apple-iOS aesthetic per CLAUDE.md — small chrome, soft border, system
// font. We use the existing utility-class tokens (border-border,
// bg-background, etc.) so this lands inside the design language the
// rest of the super-admin shell speaks.
//
// Closing behaviour: click outside, press Escape, or pick an option.
// We don't trap focus — the menu is a two-item link list and a screen-
// reader user is better served by native link semantics than a custom
// menu role.

import { useEffect, useRef, useState } from "react";

export interface AuditExportMenuProps {
  /** Query string (with leading "?", or empty) reflecting the active filters. */
  query: string;
}

export function AuditExportMenu({ query }: AuditExportMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const csvHref = `/api/admin/audit/export${query}`;
  const pdfHref = `/api/admin/audit/export-pdf${query}`;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        Export…
        <span aria-hidden="true" className="ml-1 text-text-muted">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-md border border-border bg-background shadow-md"
        >
          <a
            role="menuitem"
            href={csvHref}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm hover:bg-muted/40"
          >
            CSV
            <div className="text-xs text-text-muted">Spreadsheet, streaming</div>
          </a>
          <a
            role="menuitem"
            href={pdfHref}
            onClick={() => setOpen(false)}
            className="block border-t border-border px-3 py-2 text-sm hover:bg-muted/40"
          >
            PDF
            <div className="text-xs text-text-muted">Branded, paginated</div>
          </a>
        </div>
      )}
    </div>
  );
}
