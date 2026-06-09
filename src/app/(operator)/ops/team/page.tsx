import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { canManageElevatedRoles, canManageTeam } from "@/lib/rbac/team-management";
import { TeamRoster, type TeamMember } from "./team-roster";
import { RoleMatrix } from "./role-matrix";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team & Roles" };

/**
 * Team & Roles — the practice's staff-management surface (Back-Office
 * Operations Audit §6.6 / §7, EMR-1076). Closes the "no settings entry
 * point / no way to manage staff" gap (EMR-1083): an owner/admin can see
 * everyone in the practice and assign each person exactly the role —
 * therefore the permissions — their job needs. Clinical authoring/signing
 * is granted deliberately via the Provider role, never by default.
 */
export default async function TeamPage() {
  const user = await requireUser();
  const orgId = user.organizationId;

  if (!orgId) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Administration"
          title="Team & roles"
          description="No practice is associated with your account."
        />
      </PageShell>
    );
  }

  const memberships = await prisma.membership.findMany({
    where: { organizationId: orgId },
    select: {
      role: true,
      createdAt: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // One user can hold several memberships (one row per role). Collapse them
  // into a single roster entry carrying all their roles.
  const byUser = new Map<string, TeamMember>();
  for (const m of memberships) {
    const entry = byUser.get(m.user.id);
    if (entry) {
      entry.roles.push(m.role);
      continue;
    }
    const name = `${m.user.firstName} ${m.user.lastName}`.trim();
    byUser.set(m.user.id, {
      userId: m.user.id,
      name: name.length > 0 ? name : m.user.email,
      email: m.user.email,
      roles: [m.role],
      isSelf: m.user.id === user.id,
    });
  }
  const members = [...byUser.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const canManage = canManageTeam(user.roles);
  const canManageElevated = canManageElevatedRoles(user.roles);

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Administration"
        title="Team & roles"
        description="Assign each person in your practice the role their job needs. A role grants exactly the stations it owns — clinical authoring and signing are gated permissions, not a default."
      />
      <div className="space-y-10">
        <TeamRoster
          members={members}
          canManage={canManage}
          canManageElevated={canManageElevated}
        />
        <RoleMatrix />
      </div>
    </PageShell>
  );
}
