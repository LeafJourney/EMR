"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import type { CDSAlert, AlertSeverity, AlertCategory } from "@/lib/domain/clinical-decision-support";

/* ── Types ──────────────────────────────────────────────── */

interface CDSPanelProps {
  alerts: CDSAlert[];
  patientName: string;
}

/* ── Config ─────────────────────────────────────────────── */

const SEVERITY_STYLES: Record<AlertSeverity, { border: string; bg: string; icon: string; badge: "danger" | "warning" | "info" }> = {
  critical: { border: "border-l-red-500", bg: "bg-red-50/60", icon: "!", badge: "danger" },
  warning:  { border: "border-l-amber-500", bg: "bg-amber-50/60", icon: "⚠", badge: "warning" },
  info:     { border: "border-l-blue-500", bg: "bg-blue-50/40", icon: "i", badge: "info" },
};

const CATEGORY_ICONS: Record<AlertCategory, string> = {
  interaction: "Rx",
  dosing: "mg",
  lab: "Lab",
  screening: "Scr",
  guideline: "Gx",
  contraindication: "CI",
  allergy: "Alg",
};

/* ── Component ──────────────────────────────────────────── */

export function CDSPanel({ alerts, patientName }: CDSPanelProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | "all">("all");
  const [collapsed, setCollapsed] = useState(false);

  const visibleAlerts = alerts.filter((a) => {
    if (dismissed.has(a.id)) return false;
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    return true;
  });

  const criticalCount = alerts.filter((a) => a.severity === "critical" && !dismissed.has(a.id)).length;
  const warningCount = alerts.filter((a) => a.severity === "warning" && !dismissed.has(a.id)).length;
  const infoCount = alerts.filter((a) => a.severity === "info" && !dismissed.has(a.id)).length;

  if (alerts.length === 0) {
    return (
      <Card className="border-l-4 border-l-emerald-400">
        <CardContent className="py-4 px-5">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 text-sm font-semibold">
              ✓
            </span>
            <div>
              <p className="text-sm font-medium text-text">No active alerts</p>
              <p className="text-xs text-text-muted">Clinical decision support found no concerns for {patientName}.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Clinical Decision Support</CardTitle>
          <div className="flex items-center gap-1.5">
            {criticalCount > 0 && (
              <Badge tone="danger" className="text-[10px] px-1.5">{criticalCount}</Badge>
            )}
            {warningCount > 0 && (
              <Badge tone="warning" className="text-[10px] px-1.5">{warningCount}</Badge>
            )}
            {infoCount > 0 && (
              <Badge tone="info" className="text-[10px] px-1.5">{infoCount}</Badge>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Expand decision support" : "Collapse decision support"}
              className="ml-1 flex items-center justify-center h-6 w-6 rounded-md text-text-subtle hover:text-text hover:bg-surface-muted transition-colors"
            >
              <span className={cn("text-[11px] leading-none transition-transform", collapsed ? "" : "rotate-180")}>
                ▾
              </span>
            </button>
          </div>
        </div>

        {/* Severity filter pills */}
        {!collapsed && (
        <div className="flex items-center gap-1 mt-2">
          {(["all", "critical", "warning", "info"] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={cn(
                "text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors",
                filterSeverity === sev
                  ? "bg-accent text-white"
                  : "bg-surface-muted text-text-muted hover:bg-border"
              )}
            >
              {sev === "all" ? `All (${alerts.length - dismissed.size})` : `${sev.charAt(0).toUpperCase() + sev.slice(1)}`}
            </button>
          ))}
        </div>
        )}
      </CardHeader>

      {!collapsed && (
      <CardContent className="pt-0">
        <div className="space-y-2">
          {visibleAlerts.length === 0 ? (
            <p className="text-xs text-text-subtle py-2">
              {dismissed.size > 0 ? "All alerts acknowledged." : "No alerts match this filter."}
            </p>
          ) : (
            visibleAlerts.map((alert) => {
              const styles = SEVERITY_STYLES[alert.severity];
              const isExpanded = expanded === alert.id;

              return (
                <div
                  key={alert.id}
                  className={cn(
                    "border-l-[3px] rounded-r-lg px-3 py-2.5 transition-all cursor-pointer",
                    styles.border,
                    styles.bg,
                    isExpanded && "pb-3"
                  )}
                  onClick={() => setExpanded(isExpanded ? null : alert.id)}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Category pill */}
                    <span className="shrink-0 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/80 text-text-muted border border-border/50 uppercase tracking-wider">
                      {CATEGORY_ICONS[alert.category]}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text leading-snug">
                        {alert.title}
                      </p>

                      {isExpanded && (
                        <div className="mt-2 space-y-2">
                          <p className="text-[13px] text-text-muted leading-relaxed">
                            {alert.detail}
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] text-text-subtle">
                              Source: {alert.source}
                            </span>
                            {alert.action && (
                              <Button variant="ghost" size="sm" className="text-[11px] h-6 px-2">
                                {alert.action.label}
                              </Button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDismissed((prev) => new Set([...prev, alert.id]));
                              }}
                              className="ml-auto text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md px-3 py-1 shadow-sm transition-colors"
                            >
                              Acknowledge
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Severity badge */}
                    <Badge tone={styles.badge} className="text-[9px] shrink-0 mt-0.5">
                      {alert.severity}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {dismissed.size > 0 && (
          <button
            onClick={() => setDismissed(new Set())}
            className="mt-3 text-[11px] text-text-subtle hover:text-text transition-colors"
          >
            Show {dismissed.size} acknowledged alert{dismissed.size !== 1 ? "s" : ""}
          </button>
        )}
      </CardContent>
      )}
    </Card>
  );
}
