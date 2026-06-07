// People & role coverage — who owns/admins/staffs this practice, and which
// recommended roles are still missing. Reads the real Membership roster; the
// invite CTAs are intentionally scaffolded ("soon") because there is no
// team-invitation backend yet (only a patient-scoped CaregiverInvite exists).
//
// TODO(invite-model): wire these CTAs once an OrgInvitation model + create/
// resend/cancel/accept flow lands. Until then we never fake pending invites.

import type { PracticeStakeholder } from "../types";

type RoleGroup = {
  key: string;
  label: string;
  roles: string[];
  inviteLabel: string;
  /** Recommended for an activatable practice — drives the "missing" nudge. */
  recommended?: boolean;
};

const GROUPS: RoleGroup[] = [
  { key: "owner", label: "Owner", roles: ["practice_owner"], inviteLabel: "Invite owner", recommended: true },
  { key: "admins", label: "Practice admins", roles: ["practice_admin"], inviteLabel: "Invite admin", recommended: true },
  { key: "providers", label: "Providers", roles: ["clinician", "midlevel"], inviteLabel: "Invite provider", recommended: true },
  { key: "operations", label: "Front desk & operations", roles: ["operator", "front_office"], inviteLabel: "Invite staff" },
  { key: "backoffice", label: "Back office & billing", roles: ["back_office"], inviteLabel: "Invite staff" },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function PersonChip({ person }: { person: PracticeStakeholder }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-7 w-7 rounded-full bg-accent-soft text-accent text-[11px] font-medium flex items-center justify-center shrink-0">
        {initials(person.name) || "?"}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] text-text truncate leading-tight">
          {person.name}
        </div>
        <div className="text-[11px] text-text-muted truncate leading-tight">
          {person.email}
        </div>
      </div>
    </div>
  );
}

function InviteChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border text-[12px] text-text-muted px-2.5 py-1"
      title="Team invitations are coming soon"
    >
      {label}
      <span className="text-[10px] uppercase tracking-wide">soon</span>
    </span>
  );
}

export function PracticePeoplePanel({
  roster,
}: {
  roster: PracticeStakeholder[];
}) {
  const grouped = GROUPS.map((g) => ({
    group: g,
    people: roster.filter((m) => g.roles.includes(m.role)),
  }));
  const missingRecommended = grouped
    .filter((x) => x.group.recommended && x.people.length === 0)
    .map((x) => x.group.label);

  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-5 md:p-6 grid gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
            People &amp; roles
          </div>
          <p className="text-[13px] text-text-muted">
            {roster.length === 0
              ? "No one has been added to this practice yet."
              : `${roster.length} ${roster.length === 1 ? "person" : "people"} across this practice.`}
          </p>
        </div>
        {missingRecommended.length > 0 && (
          <div className="text-[12px] text-amber-600 max-w-[260px] text-right">
            Missing recommended role
            {missingRecommended.length > 1 ? "s" : ""}:{" "}
            {missingRecommended.join(", ")}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {grouped.map(({ group, people }) => (
          <div
            key={group.key}
            className="rounded-xl border border-border/70 bg-surface p-3.5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-text">
                {group.label}
              </span>
              <span className="text-[11px] text-text-muted tabular-nums">
                {people.length}
              </span>
            </div>
            {people.length === 0 ? (
              <div className="text-[12px] text-text-subtle italic">
                {group.recommended ? "None yet — recommended." : "None yet."}
              </div>
            ) : (
              <ul className="grid gap-2.5">
                {people.map((p) => (
                  <li key={p.userId}>
                    <PersonChip person={p} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto pt-1">
              <InviteChip label={group.inviteLabel} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
