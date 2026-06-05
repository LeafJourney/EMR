"use client";

export function PdfExportButton() {
  return (
    <button
      data-print-hide=""
      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-border rounded-md hover:bg-surface-muted transition-colors"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      Export PDF
    </button>
  );
}
