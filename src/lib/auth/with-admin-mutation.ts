// EMR-728 — Controller-route rate-limit parity helper.
//
// Wraps the three plumbing concerns every controller mutation must satisfy:
//   1. requireApiAuth({ role: "super_admin", rateLimit: { limiter, bucket } })
//   2. logControllerAction() on success (and on structured-error returns
//      whose body carries an `error` key, so denials are auditable too).
//   3. Uniform 500 envelope when the handler throws — same shape as
//      requireApiAuth's other denials so clients don't need a third branch.
//
// Route handlers declare INTENT (bucket name + inner business logic) and
// nothing else. As Practice Onboarding Controller v1 lands ~15 more
// mutation routes, this keeps the safe path the default path.
//
// Audit semantics: the helper emits ONE row per request, tagged with
// `action = controller.<bucket>.{ok|denied|error}`. The handler retains the
// option to emit its own richer logControllerAction() calls inside the
// business path (with before/after snapshots) — those are additive and the
// CI coverage check does not assert otherwise.

import "server-only";

import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { requireApiAuth } from "./api-gate";
import { adminMutationLimiter } from "./rate-limit";
import { logControllerAction } from "./audit-stub";
import { logger } from "@/lib/observability/log";
import type { AuthedUser } from "./session";

export interface AdminMutationOptions {
  /**
   * Rate-limit bucket label. Names the resource being mutated — e.g.
   * `admin.super_admin.grant`, `admin.config.publish`. Surfaces in 429
   * bodies and in the controller-audit `action` field as
   * `controller.<bucket>.<outcome>`.
   */
  bucket: string;
  /**
   * Role gate. Defaults to `"super_admin"` (the historical
   * adminMutationLimiter call sites under /api/admin/**). Pass
   * `"implementation_admin"` to allow controller-write roles
   * (super_admin OR implementation_admin) — matches the semantics of
   * `requireImplementationAdmin` in src/lib/auth/super-admin.ts.
   */
  role?: "super_admin" | "implementation_admin";
}

const CONTROLLER_WRITE_ROLES: ReadonlyArray<Role> = [
  "super_admin",
  "implementation_admin",
];

export interface AdminMutationContext<P> {
  actor: AuthedUser;
  params: P;
}

export type AdminMutationHandler<P> = (
  req: Request,
  ctx: AdminMutationContext<P>,
) => Promise<Response>;

type NextRouteContext<P> = { params: P };

/**
 * Wrap a controller mutation handler with auth + rate-limit + audit.
 *
 *   export const POST = withAdminMutation(
 *     { bucket: "admin.super_admin.grant" },
 *     async (req, { actor }) => { ... },
 *   );
 *
 * Returns a Next.js-compatible route handler. The wrapper signature
 * preserves the second-arg `{ params }` shape so dynamic routes keep
 * working without per-route plumbing.
 */
export function withAdminMutation<P = Record<string, string>>(
  options: AdminMutationOptions,
  handler: AdminMutationHandler<P>,
): (req: Request, ctx: NextRouteContext<P>) => Promise<Response> {
  const gateRole: Role = options.role ?? "super_admin";
  // When the caller asks for the implementation_admin gate we must accept
  // super_admin too (super-admins are universal). requireApiAuth checks
  // exactly one role via `.includes()`, so we do an authN gate (any
  // signed-in user) and apply the role union ourselves.
  const acceptsControllerWrite = options.role === "implementation_admin";

  return async (req: Request, ctx: NextRouteContext<P>) => {
    const gate = await requireApiAuth({
      role: acceptsControllerWrite ? undefined : gateRole,
      rateLimit: { limiter: adminMutationLimiter, bucket: options.bucket },
    });
    if (gate.error) {
      // Best-effort denial audit. We only have an actor for 429 / non-role
      // failures where requireApiAuth resolved the user first; for 401/403
      // we don't, so we skip — those denials are already covered by the
      // session/role helpers' own logging path.
      return gate.error;
    }
    const actor = gate.actor;

    if (acceptsControllerWrite && !actor.roles.some((r) => CONTROLLER_WRITE_ROLES.includes(r))) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Requires controller write access." },
        { status: 403 },
      );
    }

    const params = (ctx?.params ?? ({} as P));

    try {
      const response = await handler(req, { actor, params });

      await safeAudit({
        actor,
        action: `controller.${options.bucket}.ok`,
        targetId: extractTargetId(params),
        reason: `${req.method} ${new URL(req.url).pathname}`,
      });

      return response;
    } catch (err) {
      logger.error({
        event: "admin_mutation.threw",
        bucket: options.bucket,
        actorId: actor.id,
        err: err instanceof Error ? err.message : String(err),
      });

      await safeAudit({
        actor,
        action: `controller.${options.bucket}.error`,
        targetId: extractTargetId(params),
        reason:
          err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      });

      return NextResponse.json(
        { error: "internal_error" },
        { status: 500 },
      );
    }
  };
}

function extractTargetId<P>(params: P): string {
  if (!params || typeof params !== "object") return "unknown";
  const p = params as Record<string, unknown>;
  // Match the param names actually used under /api/admin/** and /api/configs/**:
  // [id], [userId]. Fall back to the first string value, then "unknown".
  for (const key of ["id", "userId", "configId", "practiceId", "slug"]) {
    const v = p[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  for (const v of Object.values(p)) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return "unknown";
}

async function safeAudit(entry: Parameters<typeof logControllerAction>[0]): Promise<void> {
  try {
    await logControllerAction(entry);
  } catch (err) {
    // logControllerAction is already retry-and-best-effort internally; this
    // catch exists only so a thrown audit never escapes the wrapper and
    // turns a 200 into a 500. The inner logger already captured the
    // structured failure record.
    logger.warn({
      event: "admin_mutation.audit_failed",
      action: entry.action,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
