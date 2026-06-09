// Invitation accept landing — /invite/accept/[token].
// Public route (not in the super-admin group): any authenticated user whose
// email matches the invite can accept it and be added to the org. Loads the
// invite for display; the actual mutation runs through the acceptInvitation
// server action behind an explicit button (never accept-on-GET).

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { AcceptInviteClient } from "./accept-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accept invitation — Leafjourney" };

const ROLE_LABELS: Record<string, string> = {
  practice_owner: "Practice owner",
  practice_admin: "Practice admin",
  clinician: "Provider (clinician)",
  midlevel: "Provider (mid-level)",
  front_office: "Front office",
  back_office: "Back office / billing",
};

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const user = await getCurrentUser();

  let invite:
    | { email: string; role: string; status: string; organizationId: string }
    | null = null;
  try {
    invite = await prisma.orgInvitation.findUnique({
      where: { token },
      select: { email: true, role: true, status: true, organizationId: true },
    });
  } catch {
    invite = null; // table not migrated in this env → treat as not found
  }

  const orgName = invite
    ? ((
        await prisma.organization
          .findUnique({
            where: { id: invite.organizationId },
            select: { name: true },
          })
          .catch(() => null)
      )?.name ?? "this practice")
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised shadow-md p-8 grid gap-5 text-center">
        <div className="font-display text-lg text-text tracking-tight">
          Leafjourney
        </div>

        {!invite ? (
          <div className="grid gap-3">
            <h1 className="font-display text-xl text-text">
              Invitation not found
            </h1>
            <p className="text-sm text-text-muted">
              This invitation link isn&apos;t valid or has been withdrawn.
            </p>
            <Link href="/" className="text-sm text-accent hover:underline">
              Go to homepage
            </Link>
          </div>
        ) : !user ? (
          <div className="grid gap-3">
            <h1 className="font-display text-xl text-text">
              Join {orgName}
            </h1>
            <p className="text-sm text-text-muted">
              You&apos;ve been invited to join {orgName} as{" "}
              <span className="text-text font-medium">
                {ROLE_LABELS[invite.role] ?? invite.role}
              </span>
              . Sign in with <span className="text-text">{invite.email}</span> to
              accept.
            </p>
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(`/invite/accept/${token}`)}`}
              className="mt-1 inline-flex items-center justify-center rounded-lg bg-accent text-accent-ink font-semibold text-sm px-4 py-2 hover:bg-accent-hover transition-colors"
            >
              Sign in to accept
            </Link>
          </div>
        ) : (
          <AcceptInviteClient
            token={token}
            orgName={orgName ?? "this practice"}
            roleLabel={ROLE_LABELS[invite.role] ?? invite.role}
            inviteEmail={invite.email}
            userEmail={user.email}
            status={invite.status}
          />
        )}
      </div>
    </div>
  );
}
