"use client";

// Team invitation panel — real create + revoke against OrgInvitation, plus the
// live pending list. Replaces the scaffolded "soon" chips. The email send +
// accept-flow are still TODO (see invite-actions.ts), so an invite is a tracked
// "pending" record here — never a fabricated "accepted".

import * as React from "react";
import { useRouter } from "next/navigation";
import { inviteToPractice, revokeInvitation } from "./invite-actions";
import { INVITABLE_ROLES } from "../types";
import type { PracticeInvitation } from "../loaders";

const ROLE_LABELS: Record<string, string> = {
  practice_owner: "Practice owner",
  practice_admin: "Practice admin",
  clinician: "Provider (clinician)",
  midlevel: "Provider (mid-level)",
  front_office: "Front office",
  back_office: "Back office / billing",
};

export function PracticeInvitePanel({
  organizationId,
  invitations,
}: {
  organizationId: string;
  invitations: PracticeInvitation[];
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<string>("clinician");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [okMsg, setOkMsg] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    setBusy(true);
    const res = await inviteToPractice({ organizationId, email, role });
    setBusy(false);
    if (res.ok) {
      setOkMsg(`Invitation created for ${email.trim()}.`);
      setEmail("");
      router.refresh();
    } else {
      setError(res.message);
    }
  }

  async function revoke(id: string) {
    setError(null);
    setOkMsg(null);
    const res = await revokeInvitation(id);
    if (res.ok) router.refresh();
    else setError(res.message);
  }

  function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/invite/accept/${token}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-5 md:p-6 grid gap-4">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">
        Invite team members
      </div>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] text-text-muted">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="name@practice.com"
            className="mt-1 w-full text-sm rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-accent focus:outline-none"
          />
        </div>
        <div className="min-w-[170px]">
          <label className="text-[11px] text-text-muted">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full text-sm rounded-lg border border-border bg-surface px-3 py-2 text-text focus:border-accent focus:outline-none"
          >
            {INVITABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent text-accent-ink font-semibold text-sm px-4 py-2 disabled:opacity-40 hover:bg-accent-hover transition-colors"
        >
          {busy ? "Sending…" : "Send invite"}
        </button>
      </form>
      {error && <p className="text-[12px] text-rose-deep">{error}</p>}
      {okMsg && <p className="text-[12px] text-emerald-600">{okMsg}</p>}

      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
          Pending invitations ({invitations.length})
        </div>
        {invitations.length === 0 ? (
          <div className="text-[12px] text-text-muted italic">
            No pending invitations.
          </div>
        ) : (
          <ul className="grid gap-2">
            {invitations.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-[13px] text-text truncate">
                    {inv.email}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {ROLE_LABELS[inv.role] ?? inv.role} · invited{" "}
                    {new Date(inv.invitedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => copyLink(inv.token, inv.id)}
                    className="text-[12px] text-accent hover:text-accent-hover transition-colors"
                  >
                    {copiedId === inv.id ? "Link copied ✓" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke(inv.id)}
                    className="text-[12px] text-text-muted hover:text-rose-deep transition-colors"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
