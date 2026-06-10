"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/PageHeader";
import { FreshnessIndicator } from "@/components/ui/freshness-indicator";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
// Queue transitions are shared with the operator board — same action, same
// QUEUE_STATE_ROLES gate (front_office is allowed there by design).
import { moveQueueEncounter } from "@/app/(operator)/ops/queue/actions";

// EMR-1108 (FO-1) — the desk's check-in list. One row per visit today,
// one-click state advances mirroring computeQueueTransition
// (lib/domain/visit-state.ts), plus the FO-5 balance/copay chip.

export interface FrontDeskRow {
  encounterId: string;
  patientId: string;
  patientName: string;
  scheduledFor: string;
  /** Persisted EncounterStatus value. */
  visitStatus: string;
  provider: string | null;
  modality: string;
  reason: string | null;
  balanceCents: number;
  copayOwedCents: number;
}

type MoveTarget =
  | "checked_in"
  | "ready"
  | "roomed"
  | "cancelled"
  | "no_show";

const STATUS_BADGE: Record<string, { label: string; tone: React.ComponentProps<typeof Badge>["tone"] }> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  checked_in: { label: "Checked in", tone: "info" },
  info_incomplete: { label: "Needs info", tone: "warning" },
  ready: { label: "Ready", tone: "success" },
  rooming: { label: "Rooming", tone: "info" },
  roomed: { label: "Roomed", tone: "success" },
  in_visit: { label: "With provider", tone: "accent" },
  in_progress: { label: "With provider", tone: "accent" },
  wrap_up: { label: "Checking out", tone: "warning" },
  complete: { label: "Done", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  no_show: { label: "No-show", tone: "danger" },
};

const TERMINAL = new Set(["complete", "cancelled", "no_show"]);

// Mirrors ALLOWED_QUEUE_TRANSITIONS in lib/domain/visit-state.ts for the
// desk-relevant targets, so we never render a button the server will reject.
function canMove(status: string, target: MoveTarget): boolean {
  switch (target) {
    case "checked_in":
      return status === "scheduled";
    case "ready":
      return (
        status === "scheduled" ||
        status === "checked_in" ||
        status === "info_incomplete" ||
        status === "rooming"
      );
    case "roomed":
      return status === "ready" || status === "rooming";
    case "no_show":
      return (
        status === "scheduled" ||
        status === "checked_in" ||
        status === "info_incomplete"
      );
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
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function modalityIcon(modality: string): string {
  switch (modality) {
    case "video":
      return "📹";
    case "phone":
      return "📞";
    default:
      return "🏥";
  }
}

export function FrontDeskList({
  rows,
  loadedAt,
}: {
  rows: FrontDeskRow[];
  loadedAt: string;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    // Same cadence as the operator queue board: the desk list is live.
    const refresh = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(refresh);
  }, [router]);

  const manualRefresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 400);
  };

  const waiting = rows.filter(
    (r) => !TERMINAL.has(r.visitStatus) && r.visitStatus !== "scheduled",
  ).length;
  const upcoming = rows.filter((r) => r.visitStatus === "scheduled").length;
  const done = rows.filter((r) => TERMINAL.has(r.visitStatus)).length;

  // Active visits first (in schedule order), finished day at the bottom.
  const sorted = [...rows].sort((a, b) => {
    const aDone = TERMINAL.has(a.visitStatus) ? 1 : 0;
    const bDone = TERMINAL.has(b.visitStatus) ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return a.scheduledFor.localeCompare(b.scheduledFor);
  });

  return (
    <>
      <PageHeader
        eyebrow="Front desk"
        title="Check-in"
        description={`${upcoming} scheduled · ${waiting} in the clinic · ${done} finished today`}
        actions={
          <FreshnessIndicator
            since={loadedAt}
            onRefresh={manualRefresh}
            status={refreshing ? "refreshing" : "idle"}
          />
        }
      />

      {sorted.length === 0 ? (
        <EmptyState
          title="No visits today"
          description="Booked patients appear here the moment they're on today's schedule."
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((row) => (
            <FrontDeskCard key={row.encounterId} row={row} />
          ))}
        </div>
      )}

      <p className="mt-6 text-[11px] text-text-subtle text-center">
        Auto-refreshes every 30 seconds
      </p>
    </>
  );
}

function FrontDeskCard({ row }: { row: FrontDeskRow }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [mutating, setMutating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const badge = STATUS_BADGE[row.visitStatus] ?? {
    label: row.visitStatus,
    tone: "neutral" as const,
  };
  const finished = TERMINAL.has(row.visitStatus);
  const owesCents = row.copayOwedCents + row.balanceCents;

  const runMove = (target: MoveTarget) => {
    setError(null);
    setMutating(true);
    void moveQueueEncounter({ encounterId: row.encounterId, target })
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Could not update the visit.");
        }
        router.refresh();
      })
      .catch(() => setError("Could not update the visit."))
      .finally(() => setMutating(false));
  };

  const confirmThenMove = async (
    target: "cancelled" | "no_show",
    title: string,
    description: string,
    confirmLabel: string,
  ) => {
    const ok = await confirm({
      title,
      description,
      severity: "danger",
      confirmLabel,
      cancelLabel: "Keep visit",
    });
    if (ok) runMove(target);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border/60 bg-surface p-4 md:flex-row md:items-center md:justify-between",
        finished && "opacity-60",
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        <span className="w-16 shrink-0 text-sm tabular-nums text-text-muted">
          {formatTime(row.scheduledFor)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/clinic/patients/${row.patientId}`}
              className="truncate font-medium text-text hover:text-accent"
            >
              {row.patientName}
            </Link>
            <span aria-hidden="true" title={row.modality} className="text-sm">
              {modalityIcon(row.modality)}
            </span>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {/* FO-5: what to collect, visible before the patient reaches the desk. */}
            {owesCents > 0 ? (
              <Link
                href={`/clinic/patients/${row.patientId}/billing`}
                className="rounded-full border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--warning)] tabular-nums hover:border-[color:var(--warning)]"
              >
                {row.copayOwedCents > 0
                  ? `Collect ${formatMoney(row.copayOwedCents)} copay`
                  : `Balance ${formatMoney(row.balanceCents)}`}
                {row.copayOwedCents > 0 && row.balanceCents > 0
                  ? ` · ${formatMoney(row.balanceCents)} balance`
                  : ""}
              </Link>
            ) : (
              <span className="text-[11px] text-text-subtle">No balance</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-subtle">
            {row.provider && <span>{row.provider}</span>}
            {row.reason && <span className="truncate">{row.reason}</span>}
          </div>
          {error && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      </div>

      {!finished && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canMove(row.visitStatus, "checked_in") && (
            <Button
              size="sm"
              variant="primary"
              disabled={mutating}
              onClick={() => runMove("checked_in")}
            >
              Check in
            </Button>
          )}
          {canMove(row.visitStatus, "ready") &&
            row.visitStatus !== "scheduled" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={mutating}
                onClick={() => runMove("ready")}
              >
                Mark ready
              </Button>
            )}
          {canMove(row.visitStatus, "roomed") && (
            <Button
              size="sm"
              variant="secondary"
              disabled={mutating}
              onClick={() => runMove("roomed")}
            >
              Mark roomed
            </Button>
          )}
          {canMove(row.visitStatus, "no_show") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={mutating}
              onClick={() =>
                void confirmThenMove(
                  "no_show",
                  `Mark ${row.patientName} as a no-show?`,
                  "The visit closes as a no-show. Reschedule from their chart if they still want to be seen.",
                  "Mark no-show",
                )
              }
            >
              No-show
            </Button>
          )}
          {canMove(row.visitStatus, "cancelled") && (
            <Button
              size="sm"
              variant="ghost"
              disabled={mutating}
              onClick={() =>
                void confirmThenMove(
                  "cancelled",
                  `Cancel ${row.patientName}'s visit?`,
                  "They'll be removed from today's list. You'll need to reschedule from their chart if they still want to be seen.",
                  "Cancel visit",
                )
              }
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
