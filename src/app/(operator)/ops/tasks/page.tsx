import Link from "next/link";
import type { Prisma, Role, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/rbac/roles";
import { canManageTeam } from "@/lib/rbac/team-management";
import { TasksBoard, type TaskRow } from "./tasks-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Worklist" };

const ACTIVE_STATUSES: TaskStatus[] = ["open", "in_progress", "snoozed"];

type View = "active" | "completed" | "all";
type Due = "all" | "overdue" | "soon";

type Search = {
  view?: string;
  owner?: string;
  due?: string;
};

/**
 * Staff worklist (Back-Office Operations Audit §6.5, EMR-1079). Rolls the
 * per-patient "open tasks" the system already counts into one queue the back
 * office can actually work — filterable by status, owner, and due date. The
 * back office's home screen; /ops/tasks no longer 404s.
 */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Operations"
          title="Worklist"
          description="No practice is associated with your account."
        />
      </PageShell>
    );
  }

  const view: View =
    searchParams.view === "completed" || searchParams.view === "all"
      ? searchParams.view
      : "active";
  const due: Due =
    searchParams.due === "overdue" || searchParams.due === "soon"
      ? searchParams.due
      : "all";
  const owner = searchParams.owner ?? "all";

  const now = new Date();
  const soonCutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Status facet.
  const statusWhere: Prisma.TaskWhereInput =
    view === "completed"
      ? { status: "done" }
      : view === "all"
        ? {}
        : { status: { in: ACTIVE_STATUSES } };

  // Owner facet: all | unassigned | a specific role.
  const ownerWhere: Prisma.TaskWhereInput =
    owner === "all"
      ? {}
      : owner === "unassigned"
        ? { assigneeRole: null }
        : { assigneeRole: owner as Role };

  // Due facet.
  const dueWhere: Prisma.TaskWhereInput =
    due === "overdue"
      ? { dueAt: { lt: now } }
      : due === "soon"
        ? { dueAt: { gte: now, lt: soonCutoff } }
        : {};

  const where: Prisma.TaskWhereInput = {
    organizationId: orgId,
    ...statusWhere,
    ...ownerWhere,
    ...dueWhere,
  };

  const [tasks, activeCount, overdueCount, ownerGroups] = await Promise.all([
    prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        assigneeRole: true,
        assigneeUserId: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
    }),
    prisma.task.count({
      where: { organizationId: orgId, status: { in: ACTIVE_STATUSES } },
    }),
    prisma.task.count({
      where: {
        organizationId: orgId,
        status: { in: ACTIVE_STATUSES },
        dueAt: { lt: now },
      },
    }),
    // Owner chips — which assignee roles actually have active tasks.
    prisma.task.groupBy({
      by: ["assigneeRole"],
      where: { organizationId: orgId, status: { in: ACTIVE_STATUSES } },
      _count: true,
    }),
  ]);

  // Resolve assignee display names in one batched query.
  const assigneeIds = Array.from(
    new Set(
      tasks
        .map((t) => t.assigneeUserId)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const assignees = assigneeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const nameById = new Map(
    assignees.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
  );

  const rows: TaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    assigneeRole: t.assigneeRole,
    assigneeName: t.assigneeUserId ? nameById.get(t.assigneeUserId) ?? null : null,
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    isOverdue:
      t.dueAt != null &&
      t.dueAt.getTime() < now.getTime() &&
      t.status !== "done",
    patient: t.patient
      ? {
          id: t.patient.id,
          name: `${t.patient.firstName} ${t.patient.lastName}`.trim(),
        }
      : null,
  }));

  const ownerOptions = buildOwnerOptions(ownerGroups);
  const canManage = canManageTeam(user.roles) || user.roles.includes("operator");

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Operations"
        title="Worklist"
        description="Every open task across the practice in one queue. Work the oldest and overdue first."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Active tasks" value={activeCount} />
        <StatCard label="Overdue" value={overdueCount} tone="danger" />
        <StatCard label="Showing" value={rows.length} tone="muted" />
      </div>

      {/* Filters — URL-driven so they're shareable and survive refresh. */}
      <div className="space-y-3 mb-6">
        <FilterRow
          label="Status"
          options={[
            { key: "active", label: "Active" },
            { key: "completed", label: "Completed" },
            { key: "all", label: "All" },
          ]}
          param="view"
          active={view}
          search={searchParams}
        />
        <FilterRow
          label="Due"
          options={[
            { key: "all", label: "Any time" },
            { key: "overdue", label: "Overdue" },
            { key: "soon", label: "Next 7 days" },
          ]}
          param="due"
          active={due}
          search={searchParams}
        />
        <FilterRow
          label="Owner"
          options={ownerOptions}
          param="owner"
          active={owner}
          search={searchParams}
        />
      </div>

      <TasksBoard rows={rows} canManage={canManage} />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Owner chips
// ---------------------------------------------------------------------------

function buildOwnerOptions(
  groups: Array<{ assigneeRole: Role | null; _count: number }>,
): Array<{ key: string; label: string }> {
  const opts: Array<{ key: string; label: string }> = [{ key: "all", label: "Everyone" }];
  let hasUnassigned = false;
  for (const g of groups) {
    if (g.assigneeRole === null) {
      hasUnassigned = true;
      continue;
    }
    opts.push({ key: g.assigneeRole, label: ROLE_LABELS[g.assigneeRole] ?? g.assigneeRole });
  }
  if (hasUnassigned) opts.push({ key: "unassigned", label: "Unassigned" });
  return opts;
}

// ---------------------------------------------------------------------------
// Filter row — server-rendered chips that set one search param.
// ---------------------------------------------------------------------------

function FilterRow({
  label,
  options,
  param,
  active,
  search,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  param: keyof Search;
  active: string;
  search: Search;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
        {label}
      </span>
      {options.map((opt) => {
        const isActive = active === opt.key;
        const next = { ...search, [param]: opt.key };
        const qs = new URLSearchParams(
          Object.entries(next).filter(([, v]) => v != null) as [string, string][],
        ).toString();
        return (
          <Link
            key={opt.key}
            href={qs ? `/ops/tasks?${qs}` : "/ops/tasks"}
            className={
              isActive
                ? "rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
                : "rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted hover:border-border-strong"
            }
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "danger" | "muted";
}) {
  const colors = {
    neutral: "text-text",
    danger: "text-danger",
    muted: "text-text-muted",
  };
  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <p className={`font-display text-3xl tabular-nums ${colors[tone]}`}>{value}</p>
        <p className="text-xs text-text-muted mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
