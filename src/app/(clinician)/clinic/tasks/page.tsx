import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, Role, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { KIND_LABELS } from "@/app/(operator)/ops/tasks/kinds";
import { ClinicTaskList, type ClinicTaskRow } from "./task-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Tasks" };

// EMR-1108 (FO-1) — the clinic-side task worklist. The physician workflow
// creates Tasks with assigneeRole "front_office"; the only worklist used to
// be /ops/tasks behind the operator layout, so front office could never see
// the work routed to it. This page lives inside the clinic shell and scopes
// to the viewer: tasks for any of their roles, plus tasks assigned directly
// to them.

const ACTIVE_STATUSES: TaskStatus[] = ["open", "in_progress", "snoozed"];

// Mirror of CLINIC_TASK_ROLES in ./actions.ts — page and actions must agree.
const CLINIC_TASK_ROLES: Role[] = [
  "front_office",
  "back_office",
  "clinician",
  "midlevel",
  "practice_owner",
  "practice_admin",
  "operator",
  "system",
];

type View = "active" | "completed" | "all";

export default async function ClinicTasksPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const user = await requireUser();
  if (!user.roles.some((r) => CLINIC_TASK_ROLES.includes(r))) {
    redirect("/clinic");
  }
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Worklist"
          title="My tasks"
          description="No practice is associated with your account."
        />
      </PageShell>
    );
  }

  const view: View =
    searchParams.view === "completed" || searchParams.view === "all"
      ? searchParams.view
      : "active";

  const statusWhere: Prisma.TaskWhereInput =
    view === "completed"
      ? { status: "done" }
      : view === "all"
        ? {}
        : { status: { in: ACTIVE_STATUSES } };

  // Viewer scope: tasks routed to any of my roles, plus tasks assigned
  // directly to me (whatever their role routing says).
  const scopeWhere: Prisma.TaskWhereInput = {
    OR: [
      { assigneeRole: { in: user.roles } },
      { assigneeUserId: user.id },
    ],
  };

  const where: Prisma.TaskWhereInput = {
    organizationId: orgId,
    ...statusWhere,
    ...scopeWhere,
  };

  const now = new Date();
  const [tasks, activeCount, overdueCount] = await Promise.all([
    prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        kind: true,
        assigneeRole: true,
        assigneeUserId: true,
        dueAt: true,
        createdAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [
        { dueAt: { sort: "asc", nulls: "last" } },
        { createdAt: "asc" },
      ],
      take: 200,
    }),
    prisma.task.count({
      where: {
        organizationId: orgId,
        status: { in: ACTIVE_STATUSES },
        ...scopeWhere,
      },
    }),
    prisma.task.count({
      where: {
        organizationId: orgId,
        status: { in: ACTIVE_STATUSES },
        dueAt: { lt: now },
        ...scopeWhere,
      },
    }),
  ]);

  const rows: ClinicTaskRow[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    kindLabel: t.kind ? KIND_LABELS[t.kind] : null,
    mine: t.assigneeUserId === user.id,
    claimed: t.assigneeUserId != null,
    createdAt: t.createdAt.toISOString(),
    dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    isOverdue:
      t.dueAt != null && t.dueAt.getTime() < now.getTime() && t.status !== "done",
    patient: t.patient
      ? {
          id: t.patient.id,
          name: `${t.patient.firstName} ${t.patient.lastName}`.trim(),
        }
      : null,
    // FO-1 deep link: "Follow-Up:" tasks come from visit completion and end
    // in a booking — send the desk straight to the schedule with the patient
    // pre-selected.
    bookHref:
      t.title.startsWith("Follow-Up:") && t.patient
        ? `/clinic/schedule?patient=${t.patient.id}`
        : null,
  }));

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="Worklist"
        title="My tasks"
        description="Everything routed to you or your role. Claim it, work it, mark it done."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Active for you" value={activeCount} />
        <StatCard label="Overdue" value={overdueCount} tone="danger" />
        <StatCard label="Showing" value={rows.length} tone="muted" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="w-14 shrink-0 text-[11px] font-medium uppercase tracking-wider text-text-subtle">
          Status
        </span>
        {(
          [
            { key: "active", label: "Active" },
            { key: "completed", label: "Completed" },
            { key: "all", label: "All" },
          ] as const
        ).map((opt) => (
          <Link
            key={opt.key}
            href={opt.key === "active" ? "/clinic/tasks" : `/clinic/tasks?view=${opt.key}`}
            className={
              view === opt.key
                ? "rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
                : "rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted hover:border-border-strong"
            }
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <ClinicTaskList rows={rows} />
    </PageShell>
  );
}

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
