"use client";

// Export-menu island for the clinician patient-roster header.
//
// Mirrors the super-admin audit-log export menu (CSV / PDF) so the two
// surfaces feel like one product. The route is `/api/clinic/patients/
// roster-export?format=csv|pdf` — clinic-scoped, tenant-aware, additive
// to the existing roster page.

import { useEffect, useRef, useState } from "react";

export function RosterExportMenu() {
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

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
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
            href="/api/clinic/patients/roster-export?format=csv"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm hover:bg-muted/40"
          >
            CSV
            <div className="text-xs text-text-muted">Spreadsheet</div>
          </a>
          <a
            role="menuitem"
            href="/api/clinic/patients/roster-export?format=pdf"
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
