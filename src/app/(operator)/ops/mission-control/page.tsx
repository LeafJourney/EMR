import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { MetricTile } from "@/components/ui/metric-tile";
import { agentList } from "@/lib/agents";
import { MissionControlClient } from "./mission-control-client";

export const metadata = { title: "Mission Control" };

export default async function MissionControlPage({
  searchParams,
}: {
  searchParams: { tab?: string; job?: string };
}) {
  const user = await requireUser();
  const orgFilter = user.organizationId
    ? { OR: [{ organizationId: user.organizationId }, { organizationId: null }] }
    : {};

  const activeTab =
    searchParams.tab === "approval"
      ? "approval"
      : searchParams.tab === "fleet"
        ? "fleet"
        : "all";
  const selectedJobId = searchParams.job ?? null;

  const jobsWhere = activeTab === "approval"
    ? { ...orgFilter, status: "needs_approval" as const }
    : orgFilter;

  const [jobs, counts, selectedJob, agentJobCounts] = await Promise.all([
    prisma.agentJob.findMany({
      where: jobsWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.agentJob.groupBy({
      by: ["status"],
      where: orgFilter,
      _count: true,
    }),
    selectedJobId
      ? prisma.agentJob.findUnique({ where: { id: selectedJobId } })
      : null,
    prisma.agentJob.groupBy({
      by: ["agentName", "status"],
      where: orgFilter,
      _count: true,
    }),
  ]);

  const countByStatus = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  // Build per-agent status counts
  const agentStatusCounts: Record<string, Record<string, number>> = {};
  for (const row of agentJobCounts) {
    if (!agentStatusCounts[row.agentName]) agentStatusCounts[row.agentName] = {};
    agentStatusCounts[row.agentName][row.status] = row._count;
  }

  // Serialize the selected job for the client component
  const serializedJob = selectedJob
    ? {
        id: selectedJob.id,
        workflowName: selectedJob.workflowName,
        agentName: selectedJob.agentName,
        eventName: selectedJob.eventName,
        status: selectedJob.status,
        attempts: selectedJob.attempts,
        maxAttempts: selectedJob.maxAttempts,
        input: selectedJob.input,
        output: selectedJob.output,
        logs: selectedJob.logs,
        lastError: selectedJob.lastError,
        requiresApproval: selectedJob.requiresApproval,
        createdAt: selectedJob.createdAt.toISOString(),
        startedAt: selectedJob.startedAt?.toISOString() ?? null,
        completedAt: selectedJob.completedAt?.toISOString() ?? null,
        approvedAt: selectedJob.approvedAt?.toISOString() ?? null,
        approvedById: selectedJob.approvedById,
      }
    : null;

  return (
    <PageShell maxWidth="max-w-[1400px]">
      <PageHeader
        eyebrow="Mission control"
        title="Agent orchestration"
        description="The nervous system. Every workflow, every job, every decision — in one place."
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <MetricTile label="Pending" value={countByStatus.pending ?? 0} />
        <MetricTile
          label="Running"
          value={(countByStatus.running ?? 0) + (countByStatus.claimed ?? 0)}
          accent="forest"
        />
        <MetricTile
          label="Needs approval"
          value={countByStatus.needs_approval ?? 0}
          accent="amber"
        />
        <MetricTile label="Succeeded" value={countByStatus.succeeded ?? 0} accent="forest" />
        <MetricTile label="Failed" value={countByStatus.failed ?? 0} />
      </div>

      <MissionControlClient
        jobs={jobs.map((j) => ({
          id: j.id,
          workflowName: j.workflowName,
          agentName: j.agentName,
          eventName: j.eventName,
          status: j.status,
          createdAt: j.createdAt.toISOString(),
        }))}
        activeTab={activeTab}
        selectedJob={serializedJob}
        approvalCount={countByStatus.needs_approval ?? 0}
        agents={agentList.map((a) => ({
          name: a.name,
          version: a.version,
          description: (a as any).description ?? "Autonomous workflow helper.",
          requiresApproval: a.requiresApproval,
          allowedActions: a.allowedActions,
          statusCounts: agentStatusCounts[a.name] ?? {},
        }))}
      />
    </PageShell>
  );
}
