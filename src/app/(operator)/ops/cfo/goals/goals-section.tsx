"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/ornament";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deactivateGoalAction } from "../actions";

// EMR-1066 — Active Goals: cap the list at 5 with a "show more" expander, and
// add a section-level "Archive" button (right of the header) that opens a
// popup listing all archived goals. (The directive's "stop the sidebar
// displaying on Add / Archive" half is already handled globally by the
// PillarNav same-route guard, 08125458 / PR #648.)

const MAX_VISIBLE = 5;

export interface GoalView {
  id: string;
  label: string;
  kindLabel: string;
  period: string;
  notes: string | null;
  valueLabel: string;
}

export function GoalsSection({
  active,
  archived,
}: {
  active: GoalView[];
  archived: GoalView[];
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const visible = expanded ? active : active.slice(0, MAX_VISIBLE);
  const hiddenCount = active.length - visible.length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Eyebrow className="mb-0">Active goals</Eyebrow>
        <button
          type="button"
          onClick={() => setArchiveOpen(true)}
          className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent cursor-pointer"
        >
          Archive{archived.length ? ` (${archived.length})` : ""}
        </button>
      </div>

      <div className="space-y-2">
        {active.length === 0 && (
          <Card>
            <CardContent className="pt-6 pb-6 text-center text-text-subtle italic text-sm">
              No active goals. The CFO agent uses industry benchmarks until you
              set your own.
            </CardContent>
          </Card>
        )}

        {visible.map((g) => (
          <GoalRow key={g.id} g={g} />
        ))}

        {active.length > MAX_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full rounded-lg border border-dashed border-border py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-muted hover:text-text cursor-pointer"
          >
            {expanded ? "Show less" : `Show ${hiddenCount} more`}
          </button>
        )}
      </div>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Archived goals</DialogTitle>
            <p className="text-sm text-text-muted">
              Goals you&rsquo;ve archived. They no longer drive anomaly
              detection or the goal-met badges.
            </p>
          </DialogHeader>
          {archived.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              No archived goals yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {archived.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-text">
                      {g.label}
                    </span>
                    <span className="ml-2 text-[11px] text-text-subtle">
                      {g.kindLabel} · {g.period}
                    </span>
                  </div>
                  <span className="shrink-0 font-display text-sm tabular-nums text-text-muted">
                    {g.valueLabel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoalRow({ g }: { g: GoalView }) {
  return (
    <Card tone="raised">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-text">{g.label}</span>
              <Badge tone="neutral" className="text-[10px]">
                {g.kindLabel}
              </Badge>
              <Badge tone="accent" className="text-[10px]">
                {g.period}
              </Badge>
            </div>
            {g.notes && (
              <p className="text-[11px] text-text-subtle mt-1">{g.notes}</p>
            )}
          </div>
          <span className="font-display text-lg text-text tabular-nums shrink-0">
            {g.valueLabel}
          </span>
          <form action={deactivateGoalAction}>
            <input type="hidden" name="id" value={g.id} />
            <button
              type="submit"
              className="text-[11px] text-danger hover:underline cursor-pointer"
            >
              Archive
            </button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
