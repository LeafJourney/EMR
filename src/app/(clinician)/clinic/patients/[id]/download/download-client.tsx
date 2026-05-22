"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CHART_EXPORT_SECTIONS,
  SECTION_CATALOG,
  type ChartExportSection,
} from "@/lib/domain/chart-export";

interface SectionCount {
  key: ChartExportSection;
  count: number | null; // null = not counted (no estimate available)
}

interface ChartDownloadClientProps {
  patientId: string;
  patientName: string;
  patientChartId: string;
  backHref: string;
  apiBase: string;
  sectionCounts: SectionCount[];
}

type FormatKind = "lfj" | "pdf";

export function ChartDownloadClient({
  patientId,
  patientName,
  patientChartId,
  backHref,
  apiBase,
  sectionCounts,
}: ChartDownloadClientProps) {
  const [selected, setSelected] = React.useState<Set<ChartExportSection>>(() => {
    const initial = new Set<ChartExportSection>();
    for (const s of SECTION_CATALOG) if (s.defaultOn) initial.add(s.key);
    return initial;
  });

  const countsByKey = React.useMemo(() => {
    const map = new Map<ChartExportSection, number | null>();
    for (const c of sectionCounts) map.set(c.key, c.count);
    return map;
  }, [sectionCounts]);

  const toggle = (key: ChartExportSection) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectAll = () => setSelected(new Set(CHART_EXPORT_SECTIONS));
  const selectNone = () => setSelected(new Set());
  const selectDefault = () => {
    const next = new Set<ChartExportSection>();
    for (const s of SECTION_CATALOG) if (s.defaultOn) next.add(s.key);
    setSelected(next);
  };

  const buildHref = (format: FormatKind, extra?: Record<string, string>) => {
    const params = new URLSearchParams();
    if (selected.size > 0 && selected.size < CHART_EXPORT_SECTIONS.length) {
      params.set("sections", Array.from(selected).join(","));
    }
    if (extra) {
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
    }
    const qs = params.toString();
    const route = format === "lfj" ? "lfj" : "pdf";
    return `${apiBase}/${route}${qs ? `?${qs}` : ""}`;
  };

  const disabled = selected.size === 0;

  // Helper: kick off the download. Using an anchor with `download` keeps
  // the browser's normal save flow rather than building a Blob ourselves.
  const trigger = (href: string, filename?: string) => {
    const a = document.createElement("a");
    a.href = href;
    if (filename) a.download = filename;
    a.rel = "noopener";
    a.target = filename ? "_self" : "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="space-y-6">
      {/* Patient header strip */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>{patientName}</CardTitle>
            <CardDescription>
              Chart ID: <span className="font-mono">{patientChartId.slice(0, 16).toUpperCase()}</span>
            </CardDescription>
          </div>
          <Link href={backHref}>
            <Button variant="secondary" size="sm">Back to chart</Button>
          </Link>
        </CardHeader>
      </Card>

      {/* Section picker */}
      <Card>
        <CardHeader>
          <div className="flex flex-row items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Sections to include</CardTitle>
              <CardDescription>
                Choose what makes it into the export. Selections apply to both
                <code className="font-mono mx-1">.lfj</code> and PDF outputs.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" type="button" onClick={selectAll}>
                Select all
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={selectDefault}>
                Defaults
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={selectNone}>
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {SECTION_CATALOG.map((s) => {
              const count = countsByKey.get(s.key);
              const isOn = selected.has(s.key);
              return (
                <label
                  key={s.key}
                  className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    isOn
                      ? "border-accent/60 bg-accent/5"
                      : "border-border hover:bg-surface-muted/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-emerald-600"
                    checked={isOn}
                    onChange={() => toggle(s.key)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-text">{s.label}</span>
                      {count !== null && count !== undefined && (
                        <Badge tone="neutral">{count}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">{s.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Format actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Download as .lfj</CardTitle>
            <CardDescription>
              A single JSON file containing every selected section, ready for
              import into another Leafjourney instance, an archive, or a
              backup drive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="text-sm text-text-muted list-disc list-inside space-y-1">
              <li>Structured, lossless — perfect for record transfers.</li>
              <li>Re-importable into any compatible EMR.</li>
              <li>Includes a metadata envelope (chart ID, format version, sections, preparer).</li>
            </ul>
            <Button
              type="button"
              variant="primary"
              disabled={disabled}
              onClick={() => trigger(buildHref("lfj"), undefined)}
            >
              Download .lfj
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Print / Save as PDF</CardTitle>
            <CardDescription>
              A styled, paginated document. Opens in a new tab — use your
              browser's "Save as PDF" from the print dialog for the final
              file. Print directly to mail, CD, or flash drive workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="text-sm text-text-muted list-disc list-inside space-y-1">
              <li>Patient demographics, vitals, problems, meds, notes.</li>
              <li>Letter size, 0.55in margins, page-break-aware.</li>
              <li>Confidential-PHI footer on every page.</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="highlight"
                disabled={disabled}
                onClick={() => window.open(buildHref("pdf"), "_blank", "noopener")}
              >
                Open print preview
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={disabled}
                onClick={() =>
                  trigger(buildHref("pdf", { download: "1" }), undefined)
                }
              >
                Download HTML copy
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Help footer */}
      <p className="text-xs text-text-muted">
        Patient ID <span className="font-mono">{patientId.slice(0, 8)}…</span>{" "}
        — every download is recorded in the audit log with the actor, format,
        and sections requested.
      </p>
    </div>
  );
}
