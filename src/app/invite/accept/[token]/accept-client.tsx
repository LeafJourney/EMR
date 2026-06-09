"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "@/app/(super-admin)/practices/[id]/invite-actions";

export function AcceptInviteClient({
  token,
  orgName,
  roleLabel,
  inviteEmail,
  userEmail,
  status,
}: {
  token: string;
  orgName: string;
  roleLabel: string;
  inviteEmail: string;
  userEmail: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailMatch =
    userEmail.trim().toLowerCase() === inviteEmail.trim().toLowerCase();
  const inactive = status !== "pending";

  async function accept() {
    setBusy(true);
    setError(null);
    const res = await acceptInvitation(token);
    if (res.ok) {
      router.push(res.redirectTo);
      return;
    }
    setError(res.message);
    setBusy(false);
  }

  if (inactive) {
    return (
      <div className="grid gap-3">
        <h1 className="font-display text-xl text-text">
          This invitation is no longer active
        </h1>
        <p className="text-sm text-text-muted">
          It may have already been accepted, revoked, or expired. Ask your admin
          to send a fresh invite.
        </p>
      </div>
    );
  }

  if (!emailMatch) {
    return (
      <div className="grid gap-3">
        <h1 className="font-display text-xl text-text">Wrong account</h1>
        <p className="text-sm text-text-muted">
          This invitation was sent to{" "}
          <span className="text-text">{inviteEmail}</span>, but you&apos;re
          signed in as <span className="text-text">{userEmail}</span>. Sign in
          with the invited email to accept.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <h1 className="font-display text-xl text-text">Join {orgName}</h1>
        <p className="text-sm text-text-muted">
          You&apos;ve been invited to join {orgName} as{" "}
          <span className="text-text font-medium">{roleLabel}</span>.
        </p>
      </div>
      {error && <p className="text-[13px] text-rose-deep">{error}</p>}
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="inline-flex items-center justify-center rounded-lg bg-accent text-accent-ink font-semibold text-sm px-4 py-2 disabled:opacity-40 hover:bg-accent-hover transition-colors"
      >
        {busy ? "Joining…" : "Accept & join"}
      </button>
    </div>
  );
}
