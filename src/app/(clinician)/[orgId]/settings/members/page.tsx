import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { MoreHorizontal, Plus, Shield, User as UserIcon } from "lucide-react";
import { notFound, redirect } from "next/navigation";

export const metadata = { title: "Team Members" };

const PROVIDER_LIST_CAP = 200;

// Role-display gate. Any signed-in clinician or practice admin may view
// the roster; mutation handlers (invite/remove) gate on practice_admin.
const VIEWER_ROLES = ["clinician", "practice_admin", "super_admin"] as const;

function initials(firstName: string | null, lastName: string | null): string {
  const a = (firstName ?? "").trim().charAt(0).toUpperCase();
  const b = (lastName ?? "").trim().charAt(0).toUpperCase();
  return a + b || "?";
}

interface MemberRow {
  id: string;
  firstName: string;
  lastName: string;
  specialtyLabel: string;
  isAdmin: boolean;
  lastLoginAt: Date | null;
}

export default async function MembersPage({
  params,
}: {
  params: { orgId: string };
}) {
  // EMR-?? bugfix: the previous handler called requireRole(["admin",
  // "provider"]) — both wrong: requireRole takes a single Role enum
  // value, and "admin"/"provider" aren't members of the Role enum
  // (it's clinician / practice_admin / super_admin / etc). With
  // @ts-nocheck on top, the broken call shipped; every request to
  // this page threw FORBIDDEN at the role gate. Replaced with the
  // explicit "any of these roles" check below.
  const user = await requireUser();
  if (!user.roles.some((r) => (VIEWER_ROLES as readonly string[]).includes(r))) {
    redirect("/clinic");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: params.orgId },
    include: {
      providers: {
        where: { active: true },
        orderBy: { createdAt: "asc" },
        take: PROVIDER_LIST_CAP,
        include: {
          // Provider does not carry firstName/lastName — those live on
          // the related User. The previous version accessed
          // provider.firstName.charAt(0) which threw at runtime when
          // @ts-nocheck wasn't preventing the type error.
          user: {
            select: { firstName: true, lastName: true, lastLoginAt: true },
          },
        },
      },
    },
  });

  if (!organization) {
    notFound();
  }

  const rows: MemberRow[] = organization.providers.map((provider) => ({
    id: provider.id,
    firstName: provider.user.firstName ?? "",
    lastName: provider.user.lastName ?? "",
    specialtyLabel: provider.specialties[0] ?? provider.title ?? "Provider",
    // TODO: surface the provider's actual platform role by joining
    // Membership(role) for this user × this org. Showing "Clinician"
    // universally is honest given today's schema doesn't stash a
    // per-provider admin flag — better than the fake `id.endsWith("a")`
    // heuristic the prior version used.
    isAdmin: false,
    lastLoginAt: provider.user.lastLoginAt,
  }));

  // Column defs are inferred against MemberRow so each `cell(row)`
  // gets full IntelliSense.
  const columns: ColumnDef<MemberRow>[] = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      sortFn: (a, b) =>
        `${a.lastName}${a.firstName}`.localeCompare(
          `${b.lastName}${b.firstName}`,
        ),
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center font-medium">
            {initials(row.firstName, row.lastName)}
          </div>
          <div>
            <div className="font-medium text-text">
              Dr. {row.firstName} {row.lastName}
            </div>
            <div className="text-text-muted text-xs">{row.specialtyLabel}</div>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      sortable: true,
      sortFn: (a, b) => Number(b.isAdmin) - Number(a.isAdmin),
      cell: (row) => (
        <div className="flex items-center gap-1.5 text-text-muted">
          {row.isAdmin ? (
            <>
              <Shield className="w-3.5 h-3.5" /> Admin
            </>
          ) : (
            <>
              <UserIcon className="w-3.5 h-3.5" /> Clinician
            </>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      cell: () => (
        <Badge tone="success" className="text-[10px]">
          Active
        </Badge>
      ),
    },
    {
      key: "lastActive",
      label: "Last Active",
      sortable: true,
      sortFn: (a, b) =>
        (a.lastLoginAt?.getTime() ?? 0) - (b.lastLoginAt?.getTime() ?? 0),
      cell: (row) => (
        <span className="text-text-muted tabular-nums">
          {row.lastLoginAt ? row.lastLoginAt.toLocaleString() : "—"}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "actions",
      label: "",
      align: "right",
      width: "64px",
      cell: () => (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-text-muted"
          aria-label="Actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <PageShell maxWidth="max-w-[1000px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <PageHeader
          eyebrow="Settings"
          title="Team Members"
          description="Manage clinical and administrative staff access."
        />
        <Button className="shrink-0 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Invite Member
        </Button>
      </div>

      <DataTable<MemberRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        ariaLabel="Team members"
        showDensityToggle
      />
    </PageShell>
  );
}
