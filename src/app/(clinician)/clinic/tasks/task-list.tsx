"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelative } from "@/lib/utils/format";
import {
  claimTask,
  completeTask,
  reopenTask,
  type ClinicTaskActionResult,
} from "./actions";

// EMR-1108 (FO-1) — clinic worklist rows. Mirrors the ops tasks-board card
// language so staff moving between surfaces see one system, with the
// front-desk additions: Claim, and "Book on schedule" for follow-up tasks.

export interface ClinicTaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  kindLabel: string | null;
  /** Assigned to the current viewer. */
  mine: boolean;
  /** Assigned to anyone (viewer or teammate). */
  claimed: boolean;
  createdAt: string;
  dueAt: string | null;
  isOverdue: boolean;
  patient: { id: string; name: string } | null;
  /** Set for "Follow-Up:" tasks — deep link to the schedule, patient pre-selected. */
  bookHref: string | null;
}

const STATUS_TONE: Record<TaskStatus, React.ComponentProps<typeof Badge>["tone"]> = {
  open: "accent",
  in_progress: "info",
  snoozed: "warning",
  done: "success",
  cancelled: "neutral",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  snoozed: "Snoozed",
  done: "Done",
  cancelled: "Cancelled",
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ClinicTaskList({ rows }: { rows: ClinicTaskRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function run(id: string, fn: () => Promise<ClinicTaskActionResult>) {
    setBusyId(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErrors((e) => ({ ...e, [id]: res.error }));
      else router.refresh();
      setBusyId(null);
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="All clear"
        description="Nothing routed to you right now. New tasks land here the moment a visit hands them off."
      />
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((task) => {
        const rowBusy = pending && busyId === task.id;
        const closed = task.status === "done" || task.status === "cancelled";
        return (
          <div
            key={task.id}
            className="flex flex-col gap-3 rounded-lg border border-border/60 bg-surface p-4 md:flex-row md:items-start md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-text">{task.title}</span>
                <Badge tone={STATUS_TONE[task.status]}>
                  {STATUS_LABEL[task.status]}
                </Badge>
                {task.kindLabel && <Badge tone="neutral">{task.kindLabel}</Badge>}
                {task.isOverdue && <Badge tone="danger">Overdue</Badge>}
                {task.mine && <Badge tone="info">Yours</Badge>}
              </div>
              {task.description && (
                <p className="mt-1 text-sm text-text-muted line-clamp-2 whitespace-pre-line">
                  {task.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
                {task.patient && (
                  <Link
                    href={`/clinic/patients/${task.patient.id}`}
                    className="text-accent hover:underline"
                  >
                    {task.patient.name}
                  </Link>
                )}
                <span>Created {formatRelative(task.createdAt)}</span>
                {task.dueAt && (
                  <span className={task.isOverdue ? "text-danger" : undefined}>
                    Due {formatDue(task.dueAt)}
                  </span>
                )}
              </div>
              {errors[task.id] && (
                <p className="mt-2 text-xs text-danger" role="alert">
                  {errors[task.id]}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {task.bookHref && !closed && (
                <Link href={task.bookHref}>
                  <Button size="sm" variant="primary">
                    Book on schedule
                  </Button>
                </Link>
              )}
              {closed ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={rowBusy}
                  onClick={() => run(task.id, () => reopenTask({ taskId: task.id }))}
                >
                  Reopen
                </Button>
              ) : (
                <>
                  {!task.mine && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={rowBusy}
                      onClick={() => run(task.id, () => claimTask({ taskId: task.id }))}
                    >
                      {task.claimed ? "Take over" : "Claim"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={rowBusy}
                    onClick={() => run(task.id, () => completeTask({ taskId: task.id }))}
                  >
                    Mark done
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
