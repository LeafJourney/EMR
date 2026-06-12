"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils/cn";
import type { CDSAlert, AlertSeverity, AlertCategory } from "@/lib/domain/clinical-decision-support";
import {
  acknowledgeCdsAlert,
  type CdsAckAction,
  type CdsAckRecord,
} from "./cds-actions";

/* ── Types ──────────────────────────────────────────────── */

interface CDSPanelProps {
  alerts: CDSAlert[];
  patientName: string;
  patientId: string;
  /** Persisted, still-active acknowledgements (snooze not yet expired). */
  initialAcks: CdsAckRecord[];
}

/* ── Config ─────────────────────────────────────────────── */

const SEVERITY_STYLES: Record<AlertSeverity, { border: string; bg: string; badge: "danger" | "warning" | "info" }> = {
  critical: { border: "border-l-red-500", bg: "bg-red-50/60", badge: "danger" },
  warning:  { border: "border-l-amber-500", bg: "bg-amber-50/60", badge: "warning" },
  info:     { border: "border-l-blue-500", bg: "bg-blue-50/40", badge: "info" },
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

/** Stable, content-derived key — survives the volatile index-based alert id. */
const alertKeyOf = (a: CDSAlert) => `${a.category}::${a.title}`;

/* ── Component ──────────────────────────────────────────── */

export function CDSPanel({ alerts, patientName, patientId, initialAcks }: CDSPanelProps) {
  // Seed resolved state from the persisted, still-active acknowledgements so a
  // sign-off survives reloads and other providers' sessions for its snooze
  // window (30/60/90d by severity).
  const [resolved, setResolved] = useState<Map<string, CdsAckAction>>(
    () => new Map(initialAcks.map((a) => [a.alertKey, a.action])),
  );
  const [reveal, setReveal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<AlertSeverity | "all">("all");
  const [collapsed, setCollapsed] = useState(false);

  // Critical-acknowledgement justification modal.
  const [critTarget, setCritTarget] = useState<CDSAlert | null>(null);
  const [critComment, setCritComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolved = (a: CDSAlert) => resolved.has(alertKeyOf(a));

  const visibleAlerts = alerts.filter((a) => {
    if (!reveal && isResolved(a)) return false;
    if (filterSeverity !== "all" && a.severity !== filterSeverity) return false;
    return true;
  });

  const liveCount = (sev: AlertSeverity) =>
    alerts.filter((a) => a.severity === sev && !isResolved(a)).length;
  const criticalCount = liveCount("critical");
  const warningCount = liveCount("warning");
  const infoCount = liveCount("info");
  const liveTotal = alerts.filter((a) => !isResolved(a)).length;

  async function persist(alert: CDSAlert, action: CdsAckAction, comment?: string) {
    const key = alertKeyOf(alert);
    setError(null);
    setPending(true);
    // Optimistic — hide immediately, revert if the server rejects.
    setResolved((prev) => new Map(prev).set(key, action));
    const res = await acknowledgeCdsAlert({
      patientId,
      alertKey: key,
      severity: alert.severity,
      action,
      comment,
    });
    setPending(false);
    if (!res.ok) {
      setResolved((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setError(res.error ?? "Could not save the acknowledgement.");
    }
  }

  function onAcknowledge(alert: CDSAlert) {
    if (alert.severity === "critical") {
      // Critical sign-off requires a written justification.
      setCritComment("");
      setError(null);
      setCritTarget(alert);
    } else {
      void persist(alert, "acknowledge");
    }
  }

  async function confirmCritical() {
    if (!critTarget || critComment.trim().length < 10) return;
    await persist(critTarget, "acknowledge", critComment.trim());
    setCritTarget(null);
  }

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
              {sev === "all" ? `All (${liveTotal})` : `${sev.charAt(0).toUpperCase() + sev.slice(1)}`}
            </button>
          ))}
        </div>
        )}
      </CardHeader>

      {!collapsed && (
      <CardContent className="pt-0">
        {error && (
          <p className="text-xs text-danger mb-2" role="alert">{error}</p>
        )}
        <div className="space-y-2">
          {visibleAlerts.length === 0 ? (
            <p className="text-xs text-text-subtle py-2">
              {resolved.size > 0 ? "All alerts acknowledged." : "No alerts match this filter."}
            </p>
          ) : (
            visibleAlerts.map((alert) => {
              const styles = SEVERITY_STYLES[alert.severity];
              const isExpanded = expanded === alert.id;
              const alreadyResolved = isResolved(alert);
              const isCritical = alert.severity === "critical";

              return (
                <div
                  key={alert.id}
                  className={cn(
                    "border-l-[3px] rounded-r-lg px-3 py-2.5 transition-all cursor-pointer",
                    styles.border,
                    styles.bg,
                    isExpanded && "pb-3",
                    alreadyResolved && "opacity-60",
                  )}
                  onClick={() => setExpanded(isExpanded ? null : alert.id)}
                >
                  <div className="flex items-start gap-2.5">
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
                          {isCritical && !alreadyResolved && (
                            <p className="text-[11px] font-medium text-red-600">
                              Critical — requires a justification to acknowledge and cannot be dismissed.
                            </p>
                          )}
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <span className="text-[10px] text-text-subtle">
                              Source: {alert.source}
                            </span>
                            {alert.action && (
                              <Button variant="ghost" size="sm" className="text-[11px] h-6 px-2">
                                {alert.action.label}
                              </Button>
                            )}
                            {alreadyResolved ? (
                              <span className="ml-auto text-[11px] font-medium text-emerald-700">
                                ✓ {resolved.get(alertKeyOf(alert)) === "dismiss" ? "Dismissed" : "Acknowledged"}
                              </span>
                            ) : (
                              <div className="ml-auto flex items-center gap-2">
                                {/* Dismiss — warning/info only (beige). Never for critical. */}
                                {!isCritical && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void persist(alert, "dismiss");
                                    }}
                                    disabled={pending}
                                    className="text-[12px] font-medium text-text-muted bg-[#efe7d6] hover:bg-[#e6dcc6] rounded-md px-2.5 py-1 transition-colors disabled:opacity-50"
                                  >
                                    Dismiss
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAcknowledge(alert);
                                  }}
                                  disabled={pending}
                                  className="text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md px-3 py-1 shadow-sm transition-colors disabled:opacity-50"
                                >
                                  {isCritical ? "Acknowledge & sign" : "Acknowledge"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <Badge tone={styles.badge} className="text-[9px] shrink-0 mt-0.5">
                      {alert.severity}
                    </Badge>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {resolved.size > 0 && (
          <button
            onClick={() => setReveal((r) => !r)}
            className="mt-3 text-[11px] text-text-subtle hover:text-text transition-colors"
          >
            {reveal
              ? "Hide acknowledged"
              : `Show ${resolved.size} acknowledged alert${resolved.size !== 1 ? "s" : ""}`}
          </button>
        )}
      </CardContent>
      )}

      {/* Critical-acknowledgement justification modal (no password theater —
          attribution is the authenticated session user, recorded server-side). */}
      <ModalShell
        open={!!critTarget}
        onClose={() => setCritTarget(null)}
        eyebrow="Critical alert"
        title="Acknowledge & sign"
        placement="center"
        maxWidth="max-w-lg"
      >
        <div className="px-6 py-5 space-y-3">
          {critTarget && (
            <div className="rounded-lg border-l-[3px] border-l-red-500 bg-red-50/60 px-3 py-2">
              <p className="text-sm font-medium text-text">{critTarget.title}</p>
              <p className="text-[13px] text-text-muted mt-0.5">{critTarget.detail}</p>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle mb-1.5">
              Clinical justification (required)
            </label>
            <textarea
              value={critComment}
              onChange={(e) => setCritComment(e.target.value)}
              rows={3}
              placeholder="Document your clinical reasoning for acknowledging this critical alert."
              className="w-full rounded-xl border border-border-strong bg-white px-3 py-2 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-text-subtle">
                Signed as the acknowledging provider. Minimum 10 characters.
              </span>
              <span className="text-[10px] text-text-subtle">{critComment.trim().length}/10</span>
            </div>
          </div>
          {error && <p className="text-xs text-danger" role="alert">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setCritTarget(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void confirmCritical()}
              disabled={pending || critComment.trim().length < 10}
            >
              {pending ? "Signing…" : "Acknowledge & sign"}
            </Button>
          </div>
        </div>
      </ModalShell>
    </Card>
  );
}
