// Shared auth gate for the operator-facing governance APIs added by this track
// (agent-settings, approval-defaults, credentialing, migration-jobs).
//
// Mirrors the auth-error → HTTP-status convention used by /api/configs
// (`withAuthErrors`), but for org-scoped operator surfaces: the caller supplies
// a role predicate from src/lib/rbac/ops-governance and we resolve + validate
// the session and org in one place.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { type AuthedUser, requireUser } from "@/lib/auth/session";

export type OpsAuthResult =
  | { ok: true; user: AuthedUser; organizationId: string }
  | { ok: false; response: NextResponse };

/**
 * Require an authenticated user who (a) satisfies `check` and (b) has an org.
 * Returns the user + resolved organizationId, or a ready-to-return error
 * response (401 unauthenticated, 403 wrong role, 400 no org).
 */
export async function requireOrgGovernance(
  check: (u: Pick<AuthedUser, "roles">) => boolean,
): Promise<OpsAuthResult> {
  let user: AuthedUser;
  try {
    user = await requireUser();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  if (!check(user)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  if (!user.organizationId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "no_org" }, { status: 400 }),
    };
  }

  return { ok: true, user, organizationId: user.organizationId };
}

/** Best-effort generic AuditLog write for an ops governance mutation. */
export async function logOpsAction(args: {
  organizationId: string;
  actorUserId: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Imported lazily to keep this helper importable from pure contexts/tests.
  const { prisma } = await import("@/lib/db/prisma");
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: args.organizationId,
        actorUserId: args.actorUserId,
        action: args.action,
        subjectType: args.subjectType,
        subjectId: args.subjectId,
        // Json column — cast the open metadata bag to Prisma's input type.
        metadata: (args.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  } catch {
    // An audit miss never blocks the mutation (v1 posture, matches audit-stub).
  }
}
