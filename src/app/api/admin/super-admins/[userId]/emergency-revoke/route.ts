// EMR-727 — POST /api/admin/super-admins/[userId]/emergency-revoke
//
// "Burn it down now" endpoint. The plain DELETE on the parent route
// (../route.ts) revokes the role but does not kill active sessions — a
// stolen Clerk JWT can keep operating until expiry. This endpoint:
//
//   1. Validates the caller is a *different* super-admin (cannot
//      self-revoke; matches the existing DELETE rail).
//   2. Performs the last-admin-guard Serializable txn used by the
//      regular revoke flow (still in src/lib/auth/super-admin.ts /
//      ../route.ts).
//   3. Inserts a kill-list row keyed by the target userId. Every replica
//      consults this row via the auth-gate's in-process 1s TTL cache,
//      so the kill takes effect on the next request within ≤1s
//      fleet-wide.
//   4. Emits a `super_admin.emergency_revoke` audit row carrying the
//      required reason.
//
// Body schema:
//   { reason: string (1..500 chars), confirmEmail: string }
//
// Returns 200 { ok: true } on success. Structured errors include:
//   - 400 cannot_revoke_self
//   - 400 invalid_input (reason missing / too long, confirmEmail mismatch)
//   - 400 cannot_revoke_last_super_admin (last-admin guard)
//   - 404 user_not_found

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { withAdminMutation } from "@/lib/auth/with-admin-mutation";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { kill as killSession } from "@/lib/auth/session-kill-list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /**
   * Required free-text reason. Recorded on the audit row + the kill-list
   * row. 1..500 chars — short enough to fit in a Slack alert, long enough
   * for "compromised at 14:02 PT, see #incident-413" style notes.
   */
  reason: z.string().trim().min(1).max(500),
  /**
   * Double-confirmation: the caller must type the target's email exactly.
   * This is the same friction Linear / GitHub use for destructive ops;
   * keeps fat-finger revocations out of the audit log.
   */
  confirmEmail: z.string().email().max(254),
});

export const POST = withAdminMutation<{ userId: string }>(
  { bucket: "admin.super_admin.emergency_revoke" },
  async (req, { actor, params }) => {
    const targetUserId = params.userId;
    if (!targetUserId) {
      return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
    }

    // Cannot revoke yourself even in an emergency — the whole point of
    // emergency-revoke is that another super-admin nukes a compromised
    // peer. Self-revoke from within a compromised session would let the
    // attacker pre-emptively clear their own kill before help arrived
    // (and would also let an admin accidentally lock themselves out of
    // their own incident response). Force a second admin.
    if (targetUserId === actor.id) {
      return NextResponse.json(
        {
          error: "cannot_revoke_self",
          message:
            "Emergency revoke requires another super-admin. Have a peer revoke your access.",
        },
        { status: 400 },
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_input", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { reason, confirmEmail } = parsed.data;

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    if (
      confirmEmail.trim().toLowerCase() !== targetUser.email.trim().toLowerCase()
    ) {
      return NextResponse.json(
        {
          error: "invalid_input",
          message: "confirmEmail does not match target user's email.",
        },
        { status: 400 },
      );
    }

    // Last-admin guard — identical to the regular revoke at
    // ../route.ts. Serializable so two concurrent revokes that each see
    // "2 admins remaining" don't both succeed and leave zero.
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.membership.deleteMany({
            where: { userId: targetUserId, role: "super_admin" },
          });
          const remaining = await tx.membership.findMany({
            where: { role: "super_admin" },
            select: { userId: true },
          });
          const distinctRemaining = new Set(remaining.map((m) => m.userId));
          if (distinctRemaining.size < 1) {
            throw new Error("LAST_SUPER_ADMIN");
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof Error && err.message === "LAST_SUPER_ADMIN") {
        return NextResponse.json(
          { error: "cannot_revoke_last_super_admin" },
          { status: 400 },
        );
      }
      throw err;
    }

    // The kill-list write happens AFTER the role-strip commits, so the
    // ordering is: role gone → kill armed → next request rejected. If
    // killSession() throws we still return a 500 (so the operator
    // retries) but the role is already gone — fail-secure.
    await killSession({
      userId: targetUserId,
      reason,
      revokedById: actor.id,
    });

    await logControllerAction({
      actor: {
        id: actor.id,
        email: actor.email,
        roles: actor.roles,
        organizationId: actor.organizationId,
      },
      action: "super_admin.emergency_revoke",
      targetId: targetUserId,
      before: { email: targetUser.email },
      after: { email: targetUser.email, sessionsKilled: true },
      reason,
    });

    return NextResponse.json({
      ok: true,
      targetUserId,
      targetEmail: targetUser.email,
      // The maximum end-to-end delay before the kill takes effect on a
      // replica that has the target cached. Surface it on the response so
      // the UI can display "Sessions terminated within ~1s" rather than
      // a vague "Done."
      propagationBoundMs: 1000,
    });
  },
);
