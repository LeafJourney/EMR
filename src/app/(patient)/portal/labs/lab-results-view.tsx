"use client";

import { useState } from "react";
import {
  STATUS_COLORS,
  type LabPanel,
  type LabResult,
} from "@/lib/domain/lab-results";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { LabTooltip } from "@/components/ui/lab-tooltip";

function panelStatusBadgeTone(status: LabPanel["status"]) {
  if (status === "complete") return "success" as const;
  if (status === "partial") return "warning" as const;
  return "neutral" as const;
}

function hasAbnormal(panel: LabPanel): boolean {
  return panel.results.some((r) => r.status !== "normal");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function LabResultsView({ panels }: { panels: LabPanel[] }) {
  const [expandedPanels, setExpandedPanels] = useState<Set<string>>(
    () => new Set(panels[0] ? [panels[0].id] : [])
  );
  const [selectedResult, setSelectedResult] = useState<LabResult | null>(null);

  function togglePanel(id: string) {
    setExpandedPanels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (panels.length === 0) {
    return (
      <EmptyState
        title="No lab results yet"
        description="Your lab results will appear here once your care team releases them."
      />
    );
  }

  return (
    <div className="space-y-4">
      {panels.map((panel) => {
        const isExpanded = expandedPanels.has(panel.id);
        const abnormal = hasAbnormal(panel);

        return (
          <Card key={panel.id} tone="raised">
            {/* Panel header */}
            <button
              onClick={() => togglePanel(panel.id)}
              className="w-full text-left"
              aria-expanded={isExpanded}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      {panel.name}
                      {abnormal && (
                        <span
                          className="inline-block h-2 w-2 rounded-full bg-amber-500 shrink-0"
                          title="Contains abnormal results"
                        />
                      )}
                    </CardTitle>
                    <p className="text-xs text-text-subtle mt-0.5">
                      Collected {formatDate(panel.collectedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge tone={panelStatusBadgeTone(panel.status)}>
                    {panel.status}
                  </Badge>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className={cn(
                      "text-text-subtle transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                    aria-hidden="true"
                  >
                    <path
                      d="M4 6L8 10L12 6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </CardHeader>
            </button>

            {/* Expanded results table */}
            {isExpanded && (
              <CardContent className="pt-0">
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                          Test
                        </th>
                        <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle text-right">
                          Value
                        </th>
                        <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                          Unit
                        </th>
                        <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                          Ref Range
                        </th>
                        <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle text-center">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {panel.results.map((result) => {
                        const sc = STATUS_COLORS[result.status];
                        const isAbnormal = result.status !== "normal";
                        const isSelected = selectedResult?.id === result.id;

                        return (
                          <tr
                            key={result.id}
                            className={cn(
                              "cursor-pointer transition-colors",
                              isAbnormal && sc.bg,
                              isSelected && "ring-1 ring-inset ring-accent/30",
                              !isSelected && "hover:bg-surface-muted/50"
                            )}
                            onClick={() =>
                              setSelectedResult(isSelected ? null : result)
                            }
                          >
                            <td className="px-6 py-3 font-medium text-text">
                              <LabTooltip name={result.name} value={result.value}>
                                {result.name}
                              </LabTooltip>
                            </td>
                            <td
                              className={cn(
                                "px-6 py-3 text-right tabular-nums font-semibold",
                                isAbnormal ? sc.text : "text-text"
                              )}
                            >
                              {result.value}
                            </td>
                            <td className="px-6 py-3 text-text-muted">
                              {result.unit}
                            </td>
                            <td className="px-6 py-3 text-text-subtle tabular-nums">
                              {result.referenceRange
                                ? `${result.referenceRange.low} – ${result.referenceRange.high}`
                                : "—"}
                            </td>
                            <td className="px-6 py-3 text-center">
                              <Badge
                                tone={
                                  result.status === "normal"
                                    ? "success"
                                    : result.status === "high" || result.status === "low"
                                    ? "warning"
                                    : "danger"
                                }
                              >
                                {sc.label}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Interpretation callout */}
                {selectedResult &&
                  (selectedResult.interpretation ||
                    selectedResult.cannabisRelevance) && (
                    <div className="mt-4 space-y-3">
                      {selectedResult.interpretation && (
                        <div className="rounded-lg border border-border bg-surface p-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">
                            Interpretation
                          </p>
                          <p className="text-sm text-text-muted">
                            {selectedResult.interpretation}
                          </p>
                        </div>
                      )}
                      {selectedResult.cannabisRelevance && (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-700 mb-1 flex items-center gap-1.5">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              aria-hidden="true"
                            >
                              <path
                                d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1 15v-2h2v2h-2zm0-4V7h2v6h-2z"
                                fill="currentColor"
                              />
                            </svg>
                            Cannabis Relevance
                          </p>
                          <p className="text-sm text-emerald-800">
                            {selectedResult.cannabisRelevance}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
