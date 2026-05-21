// EMR-770 — LeafBridge Agent Workbench (review queue list).
//
// Lists agent outputs that are pending human review. Each row links to a
// future detail page (approve/reject/edit + diff viewer); v1 ships the
// queue itself so reviewers have an inventory to act against.
//
// Data source: `AgentJob` rows in `needs_approval` status. The richer
// confidence/risk/source-citation surface from the full LeafBridge spec
// will move to a dedicated `AgentOutput` model in a follow-up; until
// then `AgentJob.output` is the source of truth.
//
// Server component. Auth gating is inherited from
// src/app/(super-admin)/layout.tsx (requireSuperAdmin).

import Link from "next/link";

import { prisma } from "@/lib/db/prisma";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agent Workbench — Leafjourney" };

const RELATIVE_LABEL_INTL = new Intl.RelativeTimeFormat("en-US", {
  numeric: "auto",
});
function formatRelative(date: Date): string {
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return RELATIVE_LABEL_INTL.format(diffSec, "second");
  if (abs < 3600) return RELATIVE_LABEL_INTL.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return RELATIVE_LABEL_INTL.format(Math.round(diffSec / 3600), "hour");
  return RELATIVE_LABEL_INTL.format(Math.round(diffSec / 86_400), "day");
}

async function loadReviewQueue(): Promise<
  Array<{
    id: string;
    workflowName: string;
    agentName: string;
    eventName: string;
    organizationId: string | null;
    organizationName: string | null;
    approvalRequiredAt: Date | null;
    createdAt: Date;
    attempts: number;
  }>
> {
  const jobs = await prisma.agentJob.findMany({
    where: { status: "needs_approval" },
    orderBy: [{ approvalRequiredAt: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      workflowName: true,
      agentName: true,
      eventName: true,
      organizationId: true,
      approvalRequiredAt: true,
      createdAt: true,
      attempts: true,
      organization: { select: { name: true } },
    },
  });

  return jobs.map((j) => ({
    id: j.id,
    workflowName: j.workflowName,
    agentName: j.agentName,
    eventName: j.eventName,
    organizationId: j.organizationId,
    organizationName: j.organization?.name ?? null,
    approvalRequiredAt: j.approvalRequiredAt,
    createdAt: j.createdAt,
    attempts: j.attempts,
  }));
}

export default async function AgentWorkbenchPage() {
  const rows = await loadReviewQueue();

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Operations" },
          { label: "Agent Workbench" },
        ]}
      />

      <div className="mb-6">
        <Eyebrow>Leafjourney HQ</Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1] mt-2">
          Agent Workbench
        </h1>
        <p className="text-[13px] text-text-muted mt-2 max-w-[60ch]">
          Agent outputs awaiting human review. Each item links to a detail
          page where you can approve, reject, or edit before it writes back
          to the chart. Confidence + source-citation surfaces arrive with
          the full <code>AgentOutput</code> model in a follow-up.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 text-[12px]">
        <Badge tone="warning">{rows.length} pending</Badge>
        <span className="text-text-muted">Sorted by oldest first.</span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <div className="font-display text-base text-text tracking-tight">
            Queue is empty
          </div>
          <div className="mt-1.5 text-[12px] text-text-muted">
            No agent outputs are waiting for review.
          </div>
        </div>
      ) : (
        <ol className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/workbench/${row.id}`}
                className="block rounded-lg border border-border/70 bg-surface px-4 py-3 hover:bg-surface-muted transition-colors"
              >
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-display text-[14px] text-text tracking-tight">
                      {row.workflowName} · {row.agentName}
                    </div>
                    <div className="text-[12px] text-text-muted mt-1">
                      {row.eventName}
                      {row.organizationName && (
                        <>
                          {" · "}
                          {row.organizationName}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className="text-[12px] text-text"
                      title={row.approvalRequiredAt?.toISOString() ?? row.createdAt.toISOString()}
                    >
                      {formatRelative(row.approvalRequiredAt ?? row.createdAt)}
                    </div>
                    {row.attempts > 0 && (
                      <div className="text-[10px] text-text-muted mt-0.5">
                        attempt {row.attempts}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </PageShell>
  );
}
