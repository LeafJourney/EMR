"use client";

/**
 * Post-finalize agent strip (audit minor #6).
 *
 * After a note is signed, several downstream agents fire automatically
 * (coding readiness, patient outreach, outcome tracker). They previously ran
 * invisibly — a failure was silent. This strip surfaces their live `AgentJob`
 * status so the physician knows the after-visit work actually happened.
 *
 * Jobs are server-fetched on the note page; this component only renders them
 * and offers a manual Refresh (no polling infrastructure).
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface AgentJobLite {
  id: string;
  agentName: string;
  status: string;
  lastError: string | null;
  completedAt: string | null;
}

const AGENT_LABELS: Record<string, string> = {
  codingReadiness: "Coding readiness",
  patientOutreach: "Patient outreach",
  outcomeTracker: "Outcome tracker",
};

type StatusTone = "neutral" | "success" | "warning" | "info" | "danger";

function statusBadge(status: string): { label: string; tone: StatusTone } {
  switch (status) {
    case "succeeded":
      return { label: "Done", tone: "success" };
    case "running":
    case "claimed":
      return { label: "Running", tone: "info" };
    case "pending":
      return { label: "Queued", tone: "neutral" };
    case "needs_approval":
      return { label: "Awaiting approval", tone: "warning" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "cancelled":
      return { label: "Skipped", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AgentJobStrip({ jobs }: { jobs: AgentJobLite[] }) {
  const router = useRouter();
  const [refreshing, startRefresh] = React.useTransition();

  return (
    <Card className="mt-6">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-text">After-visit automations</p>
            <p className="text-xs text-text-muted">
              Downstream agents triggered by signing this note.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {jobs.length === 0 ? (
          <p className="text-sm text-text-muted">
            No downstream agent jobs have been queued for this encounter yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => {
              const badge = statusBadge(job.status);
              return (
                <li
                  key={job.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-surface/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text">
                      {AGENT_LABELS[job.agentName] ?? job.agentName}
                    </p>
                    {job.status === "failed" && job.lastError && (
                      <p className="text-xs text-danger mt-0.5 leading-relaxed">
                        {job.lastError}
                      </p>
                    )}
                    {job.status === "succeeded" && job.completedAt && (
                      <p className="text-[11px] text-text-subtle mt-0.5">
                        Completed {fmtTime(job.completedAt)}
                      </p>
                    )}
                  </div>
                  <Badge tone={badge.tone} className="shrink-0">
                    {badge.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
