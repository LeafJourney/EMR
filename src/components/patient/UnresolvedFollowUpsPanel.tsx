"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils/format";
import type { UnresolvedFollowUp } from "@/lib/domain/unresolved-followups";

// EMR-675 — Thin client shell over the derived items from
// lib/domain/unresolved-followups.ts. Sits above ChartTaskList; one
// click promotes a loose end into a tracked Task and the converted
// item drops off automatically (Task carries the sourceRef).

export interface UnresolvedFollowUpsPanelProps {
  patientId: string;
  items: UnresolvedFollowUp[];
  /** Server action; enforces RBAC + chart-access server-side. */
  onConvert: (input: {
    patientId: string;
    title: string;
    detail?: string;
    sourceRef: string;
    dueInDays?: number;
  }) => Promise<{ ok: true; taskId: string } | { ok: false; error: string }>;
  className?: string;
}

const TONE: Record<UnresolvedFollowUp["severity"], string> = {
  danger: "border-l-danger",
  warning: "border-l-warning",
  info: "border-l-highlight/70",
};

export function UnresolvedFollowUpsPanel({
  patientId,
  items,
  onConvert,
  className,
}: UnresolvedFollowUpsPanelProps) {
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [convertedIds, setConvertedIds] = React.useState<Set<string>>(new Set());
  const [errorById, setErrorById] = React.useState<Record<string, string>>({});

  const visible = items.filter((i) => !convertedIds.has(i.id));
  if (visible.length === 0) return null;

  const handleConvert = async (item: UnresolvedFollowUp) => {
    setPendingId(item.id);
    setErrorById(({ [item.id]: _gone, ...rest }) => rest);
    try {
      const res = await onConvert({
        patientId,
        title: item.title,
        detail: item.detail,
        sourceRef: item.sourceRef,
      });
      if (res.ok) {
        setConvertedIds((prev) => new Set(prev).add(item.id));
      } else {
        setErrorById((prev) => ({ ...prev, [item.id]: res.error }));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create task";
      setErrorById((prev) => ({ ...prev, [item.id]: msg }));
    } finally {
      setPendingId(null);
    }
  };

  const dangerCount = visible.filter((i) => i.severity === "danger").length;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-sm border-l-4",
        dangerCount > 0 ? "border-l-danger" : "border-l-highlight/70",
        className,
      )}
      data-testid="unresolved-followups-panel"
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-medium">
            Unresolved follow-ups · {visible.length}
          </p>
          {dangerCount > 0 && <Badge tone="danger">{dangerCount} overdue</Badge>}
        </div>
        <span className="text-[11px] text-text-subtle">
          From prior notes &amp; triaged messages
        </span>
      </div>

      <ul className="divide-y divide-border/40">
        {visible.map((item) => {
          const isConverting = pendingId === item.id;
          const err = errorById[item.id];
          return (
            <li
              key={item.id}
              className={cn(
                "px-5 py-3 flex items-start gap-3 border-l-4 -ml-px",
                TONE[item.severity],
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-text-subtle font-medium">
                    {item.source === "note" ? "Note" : "Message"}
                  </span>
                  {item.severity === "danger" && <Badge tone="danger">Overdue</Badge>}
                  {item.severity === "warning" && <Badge tone="warning">Aging</Badge>}
                  <span className="text-[11px] text-text-subtle tabular-nums">
                    {formatRelative(item.surfacedAt)}
                  </span>
                </div>
                <Link
                  href={
                    // Per Dr. Patel: message-sourced rows open the unified
                    // messages inbox rather than the per-patient
                    // correspondence tab. Note-sourced rows keep their
                    // deep link to the originating note.
                    item.source === "message" ? "/clinic/messages" : item.href
                  }
                  className="block mt-0.5 text-sm text-text font-medium leading-snug hover:underline"
                >
                  {item.title}
                </Link>
                {item.detail && <p className="text-xs text-text-muted mt-0.5">{item.detail}</p>}
                {err && (
                  <p className="text-xs text-danger mt-1" role="alert">
                    {err}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={isConverting}
                onClick={() => handleConvert(item)}
                data-testid={`convert-followup-${item.id}`}
                className="shrink-0"
              >
                {isConverting ? "Adding…" : "Convert to task"}
              </Button>
            </li>
          );
        })}
      </ul>

      {convertedIds.size > 0 && (
        <div className="px-5 py-2 border-t border-border/60 text-[11px] text-text-subtle">
          {convertedIds.size} item{convertedIds.size === 1 ? "" : "s"} added to the task list.
        </div>
      )}
    </div>
  );
}
