"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { JobActions } from "./job-actions";
import { JobDetail } from "./job-detail";
import { approveAllJobsAction, rejectAllJobsAction } from "./actions";
import { formatRelative } from "@/lib/utils/format";

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "highlight";

interface JobRow {
  id: string;
  workflowName: string;
  agentName: string;
  eventName: string;
  status: string;
  createdAt: string;
}

interface AgentInfo {
  name: string;
  version: string;
  requiresApproval: boolean | { mode: string; confidenceThreshold?: number };
  allowedActions: string[];
  statusCounts: Record<string, number>;
}

interface SelectedJob {
  id: string;
  workflowName: string;
  agentName: string;
  eventName: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  input: unknown;
  output: unknown;
  logs: unknown;
  lastError: string | null;
  requiresApproval: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  approvedAt: string | null;
  approvedById: string | null;
}

function jobTone(status: string): BadgeTone {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  if (status === "needs_approval") return "warning";
  if (status === "running" || status === "claimed") return "info";
  return "neutral";
}

const STATUS_BADGE_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "P", tone: "neutral" },
  running: { label: "R", tone: "info" },
  claimed: { label: "R", tone: "info" },
  succeeded: { label: "S", tone: "success" },
  failed: { label: "F", tone: "danger" },
  needs_approval: { label: "A", tone: "warning" },
};

export function MissionControlClient({
  jobs,
  activeTab,
  selectedJob,
  approvalCount,
  agents,
}: {
  jobs: JobRow[];
  activeTab: "all" | "approval";
  selectedJob: SelectedJob | null;
  approvalCount: number;
  agents: AgentInfo[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [bulkPending, startBulkTransition] = useTransition();

  // Jobs shown on the approval tab are exactly the org-scoped needs_approval
  // set the bulk actions operate on; use that count for confirm copy + labels.
  const queueCount = jobs.length;
  const bulkDisabled = bulkPending || queueCount === 0;

  function runBulk(decision: "approve" | "reject") {
    void (async () => {
      const ok = await confirm({
        title:
          decision === "approve"
            ? `Approve all ${queueCount} jobs in the queue?`
            : `Reject all ${queueCount} jobs in the queue?`,
        description:
          decision === "approve"
            ? "Every job currently awaiting approval will be approved. This can't be undone."
            : "Every job currently awaiting approval will be rejected and cancelled. This can't be undone.",
        severity: decision === "approve" ? "warning" : "danger",
        confirmLabel: decision === "approve" ? "Approve all" : "Reject all",
      });
      if (!ok) return;
      startBulkTransition(async () => {
        if (decision === "approve") {
          await approveAllJobsAction();
        } else {
          await rejectAllJobsAction();
        }
        router.refresh();
      });
    })();
  }

  function setTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "all") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    params.delete("job");
    router.push(`/ops/mission-control?${params.toString()}`);
  }

  function selectJob(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("job", id);
    router.push(`/ops/mission-control?${params.toString()}`);
  }

  function closeJob() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("job");
    router.push(`/ops/mission-control?${params.toString()}`);
  }

  return (
    <>
      {/* ---- Tab bar ---- */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setTab("all")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === "all"
              ? "text-text after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent after:rounded-t-full"
              : "text-text-muted hover:text-text"
          }`}
        >
          All jobs
        </button>
        <button
          onClick={() => setTab("approval")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative inline-flex items-center gap-2 ${
            activeTab === "approval"
              ? "text-text after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent after:rounded-t-full"
              : "text-text-muted hover:text-text"
          }`}
        >
          Needs approval
          {approvalCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-semibold bg-highlight-soft text-[color:var(--highlight-hover)] rounded-full">
              {approvalCount}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ---- Job table ---- */}
        <Card className={selectedJob ? "lg:col-span-2" : "lg:col-span-3"}>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle>
                  {activeTab === "approval" ? "Approval queue" : "Jobs"}
                </CardTitle>
                <CardDescription>
                  {activeTab === "approval"
                    ? "Jobs awaiting human approval before proceeding."
                    : "Latest 50 jobs across all workflows."}
                </CardDescription>
              </div>
              {activeTab === "approval" && (
                <div className="inline-flex flex-shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bulkDisabled}
                    onClick={() => runBulk("reject")}
                  >
                    Reject all{queueCount > 0 ? ` (${queueCount})` : ""}
                  </Button>
                  <Button
                    size="sm"
                    disabled={bulkDisabled}
                    onClick={() => runBulk("approve")}
                  >
                    Approve all{queueCount > 0 ? ` (${queueCount})` : ""}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <EmptyState
                title={activeTab === "approval" ? "No jobs need approval" : "No jobs yet"}
                description={
                  activeTab === "approval"
                    ? "All approval-gated jobs have been reviewed. Check back later."
                    : "The queue is quiet. Use the patient or clinician workflows to kick off agent runs."
                }
              />
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-text-subtle border-b border-border">
                      <th className="text-left font-medium px-6 py-3">Workflow</th>
                      <th className="text-left font-medium px-3 py-3">Agent</th>
                      {!selectedJob && (
                        <th className="text-left font-medium px-3 py-3">Event</th>
                      )}
                      <th className="text-left font-medium px-3 py-3">Status</th>
                      <th className="text-left font-medium px-3 py-3">Created</th>
                      <th className="text-right font-medium px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {jobs.map((j) => {
                      const isSelected = selectedJob?.id === j.id;
                      return (
                        <tr
                          key={j.id}
                          onClick={() => selectJob(j.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-accent-soft/60 hover:bg-accent-soft/80"
                              : "hover:bg-surface-muted"
                          }`}
                        >
                          <td className="px-6 py-3 text-text font-medium">{j.workflowName}</td>
                          <td className="px-3 py-3 text-text-muted">{j.agentName}</td>
                          {!selectedJob && (
                            <td className="px-3 py-3 text-text-muted font-mono text-xs">
                              {j.eventName}
                            </td>
                          )}
                          <td className="px-3 py-3">
                            <Badge tone={jobTone(j.status)}>
                              {j.status.replace("_", " ")}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-text-subtle text-xs">
                            {formatRelative(j.createdAt)}
                          </td>
                          <td className="px-6 py-3 text-right">
                            {j.status === "needs_approval" && !isSelected && (
                              <span
                                onClick={(e) => e.stopPropagation()}
                              >
                                <JobActions jobId={j.id} />
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ---- Job detail panel (slides in when a job is selected) ---- */}
        {selectedJob && (
          <div className="lg:col-span-1">
            <JobDetail job={selectedJob} onClose={closeJob} />
          </div>
        )}

        {/* ---- Agent fleet sidebar ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Agent fleet</CardTitle>
            <CardDescription>{agents.length} registered agents.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {agents.map((a) => (
                <li key={a.name} className="rounded-lg border border-border/60 bg-surface/60 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-text">{a.name}</p>
                    <span className="text-[10px] text-text-subtle font-mono">v{a.version}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {a.requiresApproval ? (
                      <Badge tone="warning" className="!text-[9px]">approval-gated</Badge>
                    ) : (
                      <Badge tone="accent" className="!text-[9px]">autonomous</Badge>
                    )}
                    {/* Status count badges */}
                    {Object.entries(a.statusCounts).map(([status, count]) => {
                      const info = STATUS_BADGE_LABELS[status];
                      if (!info || count === 0) return null;
                      return (
                        <Badge key={status} tone={info.tone} className="!text-[9px] !px-1.5">
                          {info.label}:{count}
                        </Badge>
                      );
                    })}
                  </div>
                  {a.allowedActions.length > 0 && (
                    <p className="text-[10px] text-text-subtle leading-relaxed">
                      Actions: {a.allowedActions.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
