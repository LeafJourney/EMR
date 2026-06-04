"use client";

import { useTransition, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Check, 
  Sparkles, 
  Power, 
  Info, 
  Settings,
  ShieldCheck,
  Zap,
  Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { JobActions } from "./job-actions";
import { JobDetail } from "./job-detail";
import { approveAllJobsAction, rejectAllJobsAction } from "./actions";
import { formatRelative } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

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
  description: string;
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
  activeTab: "all" | "approval" | "fleet";
  selectedJob: SelectedJob | null;
  approvalCount: number;
  agents: AgentInfo[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const [bulkPending, startBulkTransition] = useTransition();

  // Local storage synced active/paused toggle state for each agent (EMR-974)
  const [enabledAgents, setEnabledAgents] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("enabled-agents");
      return stored ? JSON.parse(stored) : {};
    }
    return {};
  });
  
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const toggleAgent = (name: string) => {
    setEnabledAgents((prev) => {
      const next = { ...prev, [name]: prev[name] === false ? true : false };
      if (typeof window !== "undefined") {
        localStorage.setItem("enabled-agents", JSON.stringify(next));
      }
      return next;
    });
    const nextState = enabledAgents[name] === false ? "Active" : "Paused";
    triggerToast(`Agent ${name} is now ${nextState}.`);
  };

  const triggerToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

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
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-text text-background px-4 py-3 rounded-xl shadow-lg border border-border/20 transition-all duration-300 transform translate-y-0 text-sm font-medium">
          <Check className="w-4 h-4 text-accent" />
          {successToast}
        </div>
      )}

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
        {/* EMR-974: Add Agent Fleet Tab */}
        <button
          onClick={() => setTab("fleet")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
            activeTab === "fleet"
              ? "text-text after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent after:rounded-t-full"
              : "text-text-muted hover:text-text"
          }`}
        >
          Agent fleet
        </button>
      </div>

      {/* RENDER ACTIVE TAB */}
      {activeTab === "fleet" ? (
        /* Agent Fleet Full View Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
          {agents.map((a) => {
            const isEnabled = enabledAgents[a.name] !== false;
            return (
              <Card 
                key={a.name} 
                tone="raised" 
                className="relative group overflow-hidden border border-border/60 hover:border-accent/40 transition-all duration-300 hover:-translate-y-0.5 shadow-sm"
              >
                <CardHeader className="pb-3 border-b border-border/50">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-text">
                        {a.name}
                        <Badge tone="neutral" className="font-mono text-[9px] px-1 py-0.5 rounded border border-border/30">
                          v{a.version}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle mt-0.5">
                        {a.requiresApproval ? "Approval-Gated" : "Autonomous Mode"}
                      </CardDescription>
                    </div>
                    {/* Safe on/off toggle */}
                    <button
                      type="button"
                      onClick={() => toggleAgent(a.name)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold transition-all shadow-sm focus:outline-none",
                        isEnabled 
                          ? "bg-accent-soft text-accent border-accent/20 hover:bg-accent-soft/80" 
                          : "bg-surface-muted text-text-subtle border-border hover:bg-surface-raised"
                      )}
                    >
                      <Power className={cn("w-3 h-3", isEnabled ? "text-accent" : "text-text-subtle")} />
                      {isEnabled ? "Active" : "Paused"}
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {/* Summary/Description */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-text-subtle flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-text-subtle" />
                      Mission Statement
                    </span>
                    <p className="text-xs text-text font-medium leading-relaxed">
                      {a.description}
                    </p>
                  </div>

                  {/* Enlarged Actions Text List */}
                  <div className="space-y-1.5 pt-2 border-t border-border/50">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-text-subtle flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-text-subtle" />
                      Allowed Actions
                    </span>
                    {a.allowedActions.length > 0 ? (
                      <ul className="text-xs text-text-muted font-semibold pl-4 list-disc space-y-0.5">
                        {a.allowedActions.map((action) => (
                          <li key={action} className="tracking-wide">{action}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-text-subtle italic">No transactional actions permitted (read-only).</p>
                    )}
                  </div>

                  {/* Status counts */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border/50 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-text-subtle flex items-center gap-1 mr-1">
                      <Activity className="w-3.5 h-3.5 text-text-subtle" />
                      History logs:
                    </span>
                    {Object.entries(a.statusCounts).length === 0 ? (
                      <span className="text-xs text-text-subtle italic">No jobs completed.</span>
                    ) : (
                      Object.entries(a.statusCounts).map(([status, count]) => {
                        const info = STATUS_BADGE_LABELS[status];
                        if (!info || count === 0) return null;
                        return (
                          <Badge key={status} tone={info.tone} className="!text-[9px] font-semibold !px-2">
                            {info.label}: {count}
                          </Badge>
                        );
                      })
                    )}
                  </div>

                  {/* Plain language hover overlay info */}
                  <div className="absolute inset-x-0 bottom-0 bg-accent text-accent-ink p-3 text-[10.5px] font-semibold transition-all duration-300 translate-y-full group-hover:translate-y-0 border-t border-accent-ink/20 opacity-0 group-hover:opacity-100 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>Safety boundaries enforced. {a.requiresApproval ? "Requires human clinical sign-off." : "Operates autonomously."}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* All Jobs / Needs Approval - Original split view with sidebar */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
                                <span onClick={(e) => e.stopPropagation()}>
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

          {selectedJob && (
            <div className="lg:col-span-1">
              <JobDetail job={selectedJob} onClose={closeJob} />
            </div>
          )}

          {/* Sidebar - improved with compact switches + hover summary tooltips */}
          <Card>
            <CardHeader>
              <CardTitle>Agent fleetSidebar</CardTitle>
              <CardDescription>{agents.length} registered agents.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-4">
                {agents.map((a) => {
                  const isEnabled = enabledAgents[a.name] !== false;
                  return (
                    <li 
                      key={a.name} 
                      className="rounded-lg border border-border/60 bg-surface/60 p-3 relative group transition-colors hover:border-accent/40"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-text">{a.name}</p>
                          <span className="text-[9px] text-text-subtle font-mono">v{a.version}</span>
                        </div>
                        {/* Compact switch indicators */}
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          isEnabled ? "bg-success" : "bg-text-subtle"
                        )} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        {a.requiresApproval ? (
                          <Badge tone="warning" className="!text-[9px] font-semibold">gated</Badge>
                        ) : (
                          <Badge tone="accent" className="!text-[9px] font-semibold">auto</Badge>
                        )}
                        {Object.entries(a.statusCounts).map(([status, count]) => {
                          const info = STATUS_BADGE_LABELS[status];
                          if (!info || count === 0) return null;
                          return (
                            <Badge key={status} tone={info.tone} className="!text-[9px] !px-1.5 font-semibold">
                              {info.label}:{count}
                            </Badge>
                          );
                        })}
                      </div>
                      
                      {/* EMR-969: Enlarged Allowed Actions */}
                      {a.allowedActions.length > 0 && (
                        <p className="text-[11px] text-text-muted leading-relaxed font-semibold">
                          Actions: {a.allowedActions.join(", ")}
                        </p>
                      )}

                      {/* EMR-969: Plain-language tooltip on hover */}
                      <div className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 w-48 rounded bg-text text-background p-2.5 text-[10px] font-medium shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 z-30 leading-normal">
                        <p className="font-semibold text-accent mb-0.5">{a.name}</p>
                        {a.description}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
