"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { MipsEvaluation } from "@/lib/billing/mips-calculator";
import { deidentifyEvaluation } from "@/lib/billing/mips-calculator";

function toCsv(evaluation: MipsEvaluation): string {
  const rows: string[][] = [
    ["measure_id", "cms_id", "measure", "patient_token", "status", "reason"],
  ];
  for (const m of evaluation.quality.measures) {
    for (const p of m.perPatient) {
      rows.push([
        m.id,
        m.cmsId,
        m.shortName,
        p.patientId,
        p.status,
        p.reason.replace(/"/g, '""'),
      ]);
    }
  }
  return rows
    .map((r) => r.map((cell) => `"${cell}"`).join(","))
    .join("\n");
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ExportMipsButton({ evaluation }: { evaluation: MipsEvaluation }) {
  const [open, setOpen] = useState(false);
  const stamp = evaluation.generatedAt.slice(0, 10);

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        Export de-identified report
      </Button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-2 w-56 rounded-xl border border-border bg-surface-raised shadow-lg p-1"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-surface-muted text-text"
            onClick={() => {
              const deid = deidentifyEvaluation(evaluation);
              download(
                `mips-${stamp}.json`,
                JSON.stringify(deid, null, 2),
                "application/json",
              );
              setOpen(false);
            }}
          >
            Download JSON
          </button>
          <button
            className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-surface-muted text-text"
            onClick={() => {
              const deid = deidentifyEvaluation(evaluation);
              download(`mips-${stamp}.csv`, toCsv(deid), "text/csv");
              setOpen(false);
            }}
          >
            Download CSV
          </button>
        </div>
      )}
    </div>
  );
}
