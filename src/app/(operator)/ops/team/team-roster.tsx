"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/rbac/roles";
import { STAFF_ROLES, staffRoleMeta } from "@/lib/rbac/team-management";
import { addStaffRole, removeStaffRole, type RoleActionResult } from "./actions";

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  roles: Role[];
  isSelf: boolean;
}

function roleTone(role: Role): React.ComponentProps<typeof Badge>["tone"] {
  const meta = staffRoleMeta(role);
  if (!meta) return "neutral";
  if (meta.clinicalAuthoring) return "warning"; // chart-signing power: flag it
  if (meta.elevated) return "accent";
  return "neutral";
}

export function TeamRoster({
  members,
  canManage,
  canManageElevated,
}: {
  members: TeamMember[];
  canManage: boolean;
  canManageElevated: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  // Which member row currently has an action in flight, so we only disable
  // that row's controls (not the whole roster).
  const [busyUser, setBusyUser] = React.useState<string | null>(null);

  function run(userId: string, fn: () => Promise<RoleActionResult>) {
    setBusyUser(userId);
    setErrors((e) => ({ ...e, [userId]: "" }));
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setErrors((e) => ({ ...e, [userId]: res.error }));
      } else {
        router.refresh();
      }
      setBusyUser(null);
    });
  }

  function assignableFor(member: TeamMember) {
    return STAFF_ROLES.filter(
      (meta) =>
        !member.roles.includes(meta.role) &&
        (!meta.elevated || canManageElevated),
    );
  }

  function canRemove(role: Role) {
    const meta = staffRoleMeta(role);
    if (!meta) return false; // platform/realm roles aren't managed here
    if (meta.elevated && !canManageElevated) return false;
    return true;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice team</CardTitle>
        <CardDescription>
          {canManage
            ? "Assign or revoke roles for everyone in your practice. A role grants exactly the stations it owns — nothing more."
            : "Everyone in your practice and the roles they hold. Role changes are limited to owners and admins."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {members.length === 0 ? (
          <p className="text-sm text-text-muted py-6 text-center">
            No team members found for this practice.
          </p>
        ) : (
          members.map((member) => {
            const assignable = assignableFor(member);
            const rowBusy = pending && busyUser === member.userId;
            return (
              <div
                key={member.userId}
                className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 md:flex-row md:items-start md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text truncate">
                      {member.name}
                    </span>
                    {member.isSelf && (
                      <Badge tone="info">You</Badge>
                    )}
                  </div>
                  <p className="text-sm text-text-muted truncate">{member.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {member.roles.map((role) => {
                      const removable = canManage && canRemove(role) && !(role === "practice_owner" && member.isSelf);
                      return (
                        <Badge key={role} tone={roleTone(role)}>
                          {ROLE_LABELS[role] ?? role}
                          {removable && (
                            <button
                              type="button"
                              aria-label={`Remove ${ROLE_LABELS[role] ?? role}`}
                              disabled={rowBusy}
                              onClick={() =>
                                run(member.userId, () =>
                                  removeStaffRole({ targetUserId: member.userId, role }),
                                )
                              }
                              className="ml-1 -mr-0.5 rounded-full px-1 leading-none opacity-70 hover:opacity-100 disabled:opacity-40"
                            >
                              ×
                            </button>
                          )}
                        </Badge>
                      );
                    })}
                  </div>
                  {errors[member.userId] && (
                    <p className="mt-2 text-xs text-danger">{errors[member.userId]}</p>
                  )}
                </div>

                {canManage && assignable.length > 0 && (
                  <AddRoleControl
                    disabled={rowBusy}
                    options={assignable.map((m) => ({ value: m.role, label: m.label }))}
                    onAdd={(role) =>
                      run(member.userId, () =>
                        addStaffRole({ targetUserId: member.userId, role }),
                      )
                    }
                  />
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function AddRoleControl({
  options,
  onAdd,
  disabled,
}: {
  options: Array<{ value: Role; label: string }>;
  onAdd: (role: Role) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = React.useState<Role | "">("");
  return (
    <div className="flex shrink-0 items-center gap-2">
      <select
        value={selected}
        disabled={disabled}
        onChange={(e) => setSelected(e.target.value as Role)}
        className="h-9 rounded-md border border-border-strong/70 bg-surface px-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-50"
        aria-label="Role to add"
      >
        <option value="">Add role…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || selected === ""}
        onClick={() => {
          if (selected !== "") {
            onAdd(selected);
            setSelected("");
          }
        }}
      >
        Add
      </Button>
    </div>
  );
}
