"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shell/PageHeader";
import { cn } from "@/lib/utils/cn";
import { listStagger, listStaggerChild } from "@/lib/ui/motion";
import {
  QUEUE_STATUS_CONFIG,
  calculateWaitTime,
  type QueueEntry,
  type QueueStatus,
} from "@/lib/domain/queue-board";
import {
  useContextMenu,
  ContextMenuIcons,
  type ContextMenuItem,
} from "@/components/ui/context-menu";
import { useDensity, densityClass } from "@/lib/ui/density";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FreshnessIndicator } from "@/components/ui/freshness-indicator";
import { moveQueueEncounter } from "./actions";

const COLUMN_ORDER: QueueStatus[] = [
  "scheduled",
  "arrived",
  "rooming",
  "in_visit",
  "checkout",
  "completed",
];

function modalityIcon(modality: QueueEntry["modality"]): string {
  switch (modality) {
    case "video":
      return "📹";
    case "phone":
      return "📞";
    case "in_person":
    default:
      return "🏥";
  }
}

function waitToneClass(minutes: number | null | undefined): string {
  if (minutes == null) return "text-text-subtle";
  if (minutes < 10) return "text-success";
  if (minutes <= 20) return "text-[color:var(--highlight-hover)]";
  return "text-danger font-medium";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

type QueueActionTarget =
  | "checked_in"
  | "info_incomplete"
  | "ready"
  | "rooming"
  | "roomed"
  | "wrap_up"
  | "complete"
  | "cancelled"
  | "no_show";

function visitStatusLabel(status?: string): { label: string; tone: "neutral" | "success" | "warning" | "info" } | null {
  switch (status) {
    case "info_incomplete":
      return { label: "Needs info", tone: "warning" };
    case "checked_in":
      return { label: "Checked in", tone: "info" };
    case "ready":
      return { label: "Ready", tone: "success" };
    case "rooming":
      return { label: "Rooming", tone: "info" };
    case "roomed":
      return { label: "Roomed", tone: "success" };
    case "wrap_up":
      return { label: "Wrap-up", tone: "warning" };
    default:
      return null;
  }
}

function canMoveVisit(entry: QueueEntry, target: QueueActionTarget): boolean {
  const status = entry.visitStatus ?? entry.status;
  switch (target) {
    case "checked_in":
      return status === "scheduled";
    case "info_incomplete":
      return status === "scheduled" || status === "checked_in";
    case "ready":
      return status === "scheduled" || status === "checked_in" || status === "info_incomplete";
    case "rooming":
      return status === "checked_in" || status === "ready";
    case "roomed":
      return status === "rooming" || status === "ready";
    case "wrap_up":
      return status === "roomed" || status === "in_visit";
    case "complete":
      return status === "wrap_up" || status === "in_visit";
    case "cancelled":
      return [
        "scheduled",
        "checked_in",
        "info_incomplete",
        "ready",
        "rooming",
        "roomed",
        "in_visit",
      ].includes(status);
    case "no_show":
      return status === "scheduled" || status === "checked_in" || status === "info_incomplete";
  }
}

export function QueueBoard({
  entries,
  loadedAt,
}: {
  entries: QueueEntry[];
  /** ISO timestamp of the server fetch — drives the FreshnessIndicator chip. */
  loadedAt?: string;
}) {
  const router = useRouter();
  // Density preference — tightens both per-column gutters and per-card
  // padding via the descendant selector on `QueueCard`.
  const { density } = useDensity();
  const [refreshing, setRefreshing] = useState(false);
  // Click handler for the FreshnessIndicator's ↻ button. Wraps
  // router.refresh() in a tiny pending window so the spinner has somewhere
  // to live; the 30s background poll keeps ticking independently.
  const manualRefresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 400);
  };
  // Bumping this state forces React to re-render the wait-time calculations
  // every minute without doing a full server round-trip in between refreshes.
  const [, setTick] = useState(0);

  useEffect(() => {
    // 30-second auto-refresh from the server (per spec).
    const refresh = setInterval(() => router.refresh(), 30_000);
    // 60-second tick to keep wait-time chips moving between server refreshes.
    const tick = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [router]);

  // Bucket the entries by status so each column only iterates its own list.
  const byStatus = useMemo(() => {
    const map: Record<QueueStatus, QueueEntry[]> = {
      scheduled: [],
      arrived: [],
      rooming: [],
      in_visit: [],
      checkout: [],
      completed: [],
    };
    for (const e of entries) {
      // Recompute wait time at render time so the chip is always live.
      const live = calculateWaitTime(e.scheduledFor, e.status);
      map[e.status].push({ ...e, minutesWaiting: live ?? undefined });
    }
    return map;
  }, [entries]);

  const inRooms =
    byStatus.rooming.length + byStatus.in_visit.length;
  const waiting = byStatus.scheduled.length + byStatus.arrived.length;
  const done = byStatus.completed.length;

  return (
    <>
      <PageHeader
        eyebrow="Front desk"
        title="Today's Queue"
        description={`${inRooms} in rooms · ${waiting} waiting · ${done} completed today`}
        actions={
          loadedAt ? (
            <FreshnessIndicator
              since={loadedAt}
              onRefresh={manualRefresh}
              status={refreshing ? "refreshing" : "idle"}
            />
          ) : undefined
        }
      />

      <div
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 density-grid",
          densityClass(density),
        )}
      >
        {COLUMN_ORDER.map((status) => (
          <QueueColumn
            key={status}
            status={status}
            entries={byStatus[status]}
          />
        ))}
      </div>

      <p className="mt-6 text-[11px] text-text-subtle text-center">
        Auto-refreshes every 30 seconds
      </p>
    </>
  );
}

function QueueColumn({
  status,
  entries,
}: {
  status: QueueStatus;
  entries: QueueEntry[];
}) {
  const config = QUEUE_STATUS_CONFIG[status];
  // Shared motion: stagger queue card fan-in within the column. No-op
  // under prefers-reduced-motion. Each card slides up a hair on entry,
  // which makes the 30-second auto-refresh feel "live" instead of
  // suddenly mutated.
  const reduceMotion = useReducedMotion() ?? false;
  const listProps = listStagger(reduceMotion);
  const childVariants = listStaggerChild(reduceMotion);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
          {config.label}
        </p>
        <Badge tone="neutral" className="tabular-nums">
          {entries.length}
        </Badge>
      </div>

      <motion.div
        className="space-y-2 min-h-[80px] rounded-xl bg-surface-muted/40 p-2"
        // Replay stagger when the entries array identity changes (auto-refresh).
        key={`queue-${status}-${entries.length}`}
        {...listProps}
      >
        {entries.length === 0 ? (
          <div className="text-center py-6 text-[11px] text-text-subtle italic">
            empty
          </div>
        ) : (
          entries.map((entry) => (
            <motion.div key={entry.encounterId} variants={childVariants}>
              <QueueCard entry={entry} />
            </motion.div>
          ))
        )}
      </motion.div>
    </div>
  );
}

function QueueCard({ entry }: { entry: QueueEntry }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [mutating, setMutating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const wait = entry.minutesWaiting;
  const waitClass = waitToneClass(wait);
  const statusLabel = visitStatusLabel(entry.visitStatus);

  const runMove = (target: QueueActionTarget) => {
    setActionError(null);
    setMutating(true);
    void moveQueueEncounter({ encounterId: entry.encounterId, target })
      .then((result) => {
        if (!result.ok) {
          setActionError(result.error ?? "Could not update the visit.");
        }
        router.refresh();
      })
      .catch(() => {
        setActionError("Could not update the visit.");
      })
      .finally(() => setMutating(false));
  };

  const items: ContextMenuItem[] = [
    {
      label: "Open chart",
      icon: ContextMenuIcons.Open,
      onSelect: (c) => {
        router.push(`/clinic/patients?q=${encodeURIComponent(entry.patientName)}`);
        c();
      },
      kbd: "↵",
    },
    {
      label: "Mark arrived",
      icon: ContextMenuIcons.Check,
      disabled: mutating || !canMoveVisit(entry, "checked_in"),
      onSelect: (c) => {
        runMove("checked_in");
        c();
      },
    },
    {
      label: "Needs info",
      icon: ContextMenuIcons.Calendar,
      disabled: mutating || !canMoveVisit(entry, "info_incomplete"),
      onSelect: (c) => {
        runMove("info_incomplete");
        c();
      },
    },
    {
      label: "Mark ready",
      icon: ContextMenuIcons.Check,
      disabled: mutating || !canMoveVisit(entry, "ready"),
      onSelect: (c) => {
        runMove("ready");
        c();
      },
    },
    {
      label: "Move to rooming",
      icon: ContextMenuIcons.Calendar,
      disabled: mutating || !canMoveVisit(entry, "rooming"),
      onSelect: (c) => {
        runMove("rooming");
        c();
      },
    },
    {
      label: "Mark roomed",
      icon: ContextMenuIcons.Check,
      disabled: mutating || !canMoveVisit(entry, "roomed"),
      onSelect: (c) => {
        runMove("roomed");
        c();
      },
    },
    {
      label: "Start checkout",
      icon: ContextMenuIcons.Check,
      disabled: mutating || !canMoveVisit(entry, "wrap_up"),
      onSelect: (c) => {
        runMove("wrap_up");
        c();
      },
    },
    {
      label: "Complete visit",
      icon: ContextMenuIcons.Check,
      disabled: mutating || !canMoveVisit(entry, "complete"),
      onSelect: (c) => {
        runMove("complete");
        c();
      },
    },
    {
      label: "Mark no-show",
      icon: ContextMenuIcons.Archive,
      disabled: mutating || !canMoveVisit(entry, "no_show"),
      onSelect: (c) => {
        runMove("no_show");
        c();
      },
    },
    { divider: true, label: "" },
    {
      label: "Copy patient name",
      icon: ContextMenuIcons.Copy,
      onSelect: (c) => {
        try {
          void navigator.clipboard?.writeText(entry.patientName);
        } catch {
          /* ignore */
        }
        c();
      },
    },
    { divider: true, label: "" },
    {
      label: "Cancel visit",
      icon: ContextMenuIcons.Archive,
      danger: true,
      disabled: mutating || !canMoveVisit(entry, "cancelled"),
      onSelect: (c) => {
        c();
        void (async () => {
          const ok = await confirm({
            title: `Cancel ${entry.patientName}'s visit?`,
            description:
              "They'll be removed from today's queue. You'll need to reschedule from their chart if they still want to be seen.",
            severity: "danger",
            confirmLabel: "Cancel visit",
            cancelLabel: "Keep on queue",
          });
          if (ok) runMove("cancelled");
        })();
      },
    },
  ];
  const ctx = useContextMenu(() => items);

  return (
    <Card
      tone="raised"
      // Comfortable keeps the original feel; Dense halves vertical
      // padding so the front-desk board can show ~50% more cards per
      // column without scroll.
      className="px-3 py-2.5 [.density-dense_&]:px-2 [.density-dense_&]:py-1.5"
      onContextMenu={ctx.triggerProps.onContextMenu}
      onTouchStart={ctx.triggerProps.onTouchStart}
      onTouchEnd={ctx.triggerProps.onTouchEnd}
      onTouchMove={ctx.triggerProps.onTouchMove}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium text-text truncate flex-1">
          {entry.patientName}
        </p>
        <span aria-hidden="true" className="text-base shrink-0" title={entry.modality}>
          {modalityIcon(entry.modality)}
        </span>
      </div>

      {statusLabel && (
        <Badge tone={statusLabel.tone} className="mb-1.5">
          {statusLabel.label}
        </Badge>
      )}

      <div className="flex items-center gap-2 text-[11px] text-text-muted tabular-nums">
        <span>{formatTime(entry.scheduledFor)}</span>
        {entry.provider && (
          <>
            <span aria-hidden="true">·</span>
            <span className="truncate">{entry.provider}</span>
          </>
        )}
      </div>

      {entry.reason && (
        <p className="text-[11px] text-text-subtle mt-1 line-clamp-1">
          {entry.reason}
        </p>
      )}

      {!!entry.readinessFlags?.length && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.readinessFlags.slice(0, 3).map((flag) => (
            <Badge key={flag} tone="neutral" className="text-[10px]">
              {flag}
            </Badge>
          ))}
        </div>
      )}

      {entry.handoffNote && (
        <p className="mt-2 text-[11px] leading-snug text-text-muted line-clamp-2">
          {entry.handoffNote}
        </p>
      )}

      {entry.status !== "completed" && wait != null && (
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/40">
          <span className={cn("text-[11px] tabular-nums", waitClass)}>
            {wait === 0 ? "on time" : `${wait}m wait`}
          </span>
          {entry.room && (
            <span className="text-[10px] text-text-subtle">
              Room {entry.room}
            </span>
          )}
        </div>
      )}
      {actionError && (
        <p role="alert" className="mt-2 text-[11px] leading-snug text-danger">
          {actionError}
        </p>
      )}
      {ctx.menu}
    </Card>
  );
}
