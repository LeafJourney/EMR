// Centralized auth gate for API route handlers.
//
// Replaces the copy-paste pattern that landed across the admin routes
// in PR #195:
//
//   try {
//     await bootstrapSuperAdminIfAllowlisted(await requireUser());
//     await requireSuperAdmin();   // (or requireRole / requireImplementationAdmin)
//   } catch (err) {
//     const code = err instanceof Error ? err.message : "FORBIDDEN";
//     return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : 403 });
//   }
//
// Goals:
//   1. One call per route. Adding a new gated route is `requireApiAuth({ role: "..." })`,
//      not 8 lines of try/catch.
//   2. Consistent error envelope across the API surface. No more handler-by-handler
//      drift in 401-vs-403 mapping or error-key naming.
//   3. A single place to add cross-cutting concerns: rate limiting hook,
//      structured logging, audit-on-deny, etc. Each lands once instead of 28 times.
//
// Usage:
//   const gate = await requireApiAuth({ role: "super_admin" });
//   if (gate.error) return gate.error;
//   const actor = gate.actor;
//
// Why an early-return shape instead of throwing? Route handlers in Next.js
// can either return a Response or throw. Throwing forces every route to
// remember to wrap in try/catch — exactly the pattern this module is
// trying to eliminate. The early-return shape lets the handler stay flat.

import "server-only";

import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { logger } from "@/lib/observability/log";
import { type AuthedUser, requireUser } from "./session";
import { bootstrapSuperAdminIfAllowlisted } from "./super-admin-bootstrap";
import { readImpersonationFromCookies } from "./impersonation";
import { isUserRevoked } from "./session-kill-list";
import {
  buildMfaRequiredResponse,
  loadSuperAdminMfaState,
} from "./super-admin-mfa";

/**
 * HTTP methods we consider "read-only." Anything else is treated as a
 * mutation and refused during impersonation. OPTIONS is included
 * because CORS preflights are required to succeed even on routes whose
 * non-preflight method would 403 — refusing the preflight breaks the
 * client error UI before the user ever sees the 403 body.
 */
const READ_ONLY_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

export interface RequireApiAuthOptions {
  /**
   * Required role. If the caller doesn't hold this role, returns 403.
   * Omit for "any signed-in user."
   */
  role?: Role;

  /**
   * Run the SUPER_ADMIN_BOOTSTRAP_EMAILS lazy-promotion path before
   * checking the role. Defaults to true when role === "super_admin",
   * false otherwise — matches the existing call-site convention.
   * Set explicitly to override.
   */
  bootstrapSuperAdmin?: boolean;

  /**
   * Optional rate-limit gate. Runs AFTER successful authN/authZ and
   * keys the limiter on the resolved actor's id. Returns 429 with
   * Retry-After when the actor is over budget.
   *
   * Pass one of the pre-configured limiters from
   * `src/lib/auth/rate-limit.ts` (adminMutationLimiter,
   * agentInvocationLimiter) or a custom one — the helper only sees
   * the RateLimiter shape.
   */
  rateLimit?: {
    limiter: { check(id: string): { allowed: boolean; resetAt: number } };
    /** Bucket label included in the 429 response — for client-side debugging. */
    bucket?: string;
  };

  /**
   * Optional Request handle. When supplied, the gate enforces the
   * EMR-742 impersonation read-only rule: if an impersonation session
   * is active and the request method is NOT in READ_ONLY_METHODS, the
   * gate returns 403 with body `{ error: "impersonation_read_only" }`.
   *
   * Why is this opt-in? Some routes (the impersonation exit route
   * itself, plus the bootstrap-grant audit row) need to mutate state
   * *during* impersonation to terminate or attribute the session. They
   * deliberately omit `request` to bypass the gate. Every other admin
   * mutation MUST pass `request` so the gate can enforce read-only.
   *
   * `withAdminMutation()` passes this automatically — most routes
   * inherit the enforcement for free.
   */
  request?: Request;
}

export type RequireApiAuthResult =
  | { actor: AuthedUser; error: null }
  | { actor: null; error: Response };

/**
 * Resolve the authenticated user, optionally lazy-promote via the
 * super-admin bootstrap allowlist, and check role membership. Returns
 * a discriminated union so the route handler stays flat:
 *
 *   const gate = await requireApiAuth({ role: "super_admin" });
 *   if (gate.error) return gate.error;
 *   // gate.actor is now AuthedUser with the required role
 */
export async function requireApiAuth(
  options: RequireApiAuthOptions = {},
): Promise<RequireApiAuthResult> {
  const wantsBootstrap =
    options.bootstrapSuperAdmin ?? options.role === "super_admin";

  let user: AuthedUser;
  try {
    user = await requireUser();
  } catch {
    return {
      actor: null,
      error: NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required." },
        { status: 401 },
      ),
    };
  }

  // EMR-727: emergency-revoke kill-list. Consulted on every authenticated
  // request via a 1s in-process TTL cache (≤1s fleet-wide propagation).
  // If the actor is on the list, refuse with a structured 401 so clients
  // can distinguish "your session was killed" from "you were never signed
  // in" and force the user back to the sign-in flow.
  try {
    if (await isUserRevoked(user.id)) {
      return {
        actor: null,
        error: NextResponse.json(
          {
            error: "UNAUTHORIZED",
            code: "session_revoked",
            message: "Your session has been revoked. Please sign in again.",
          },
          { status: 401 },
        ),
      };
    }
  } catch (err) {
    // A kill-list lookup failure must NOT silently grant access — but it
    // also can't block the entire fleet during a DB hiccup. Log loud and
    // fail open: the worst case is the existing JWT-TTL window we had
    // before this feature. The structured log makes the regression
    // visible to on-call.
    logger.error({
      event: "auth.kill_list.lookup_failed",
      userId: user.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  if (wantsBootstrap) {
    try {
      await bootstrapSuperAdminIfAllowlisted(user);
    } catch (err) {
      // Bootstrap failure is unusual (DB hiccup) but shouldn't 500 the
      // request — fall through to the role check, which will 403 if the
      // user wasn't already a super-admin.
      logger.warn({
        event: "auth.bootstrap.threw",
        userId: user.id,
        err,
      });
    }
  }

  if (options.role && !user.roles.includes(options.role)) {
    return {
      actor: null,
      error: NextResponse.json(
        { error: "FORBIDDEN", message: `Requires role: ${options.role}` },
        { status: 403 },
      ),
    };
  }

  // EMR-725 — Super-admin MFA enforcement. Existing super-admins without
  // MFA get a one-time 14-day grace window (stamped on first read by
  // loadSuperAdminMfaState); after that the gate hard-blocks with a
  // structured `mfa_required` 403. See ./super-admin-mfa.ts for the
  // grace-window design rationale.
  if (user.roles.includes("super_admin")) {
    const mfaState = await loadSuperAdminMfaState(user);
    if (mfaState.status === "blocked") {
      await logMfaBlocked(user, mfaState.graceUntil);
      return { actor: null, error: buildMfaRequiredResponse(mfaState.graceUntil) };
    }
    if (mfaState.status === "grace") {
      logger.warn({
        event: "auth.super_admin_mfa.grace_active",
        userId: user.id,
        graceUntil: mfaState.graceUntil.toISOString(),
      });
    }
  }

  // ── EMR-742: impersonation read-only enforcement ─────────────
  // Runs AFTER authN/authZ + MFA gate but BEFORE rate limiting (we
  // don't want a refused mutation to also burn budget).
  //
  // The gate is opt-in via `options.request` — see RequireApiAuthOptions
  // for the rationale. When opted in, ANY non-GET method during an
  // active impersonation is refused with a stable error envelope.
  if (options.request) {
    const method = options.request.method?.toUpperCase() ?? "GET";
    // The impersonation-exit route MUST always be allowed even during an
    // active impersonation — otherwise the user can't terminate the
    // session they're trying to end. middleware.ts has the same
    // exemption at the edge layer.
    const isImpersonationExit = (() => {
      try {
        return new URL(options.request.url).pathname ===
          "/api/admin/impersonate/exit";
      } catch {
        return false;
      }
    })();
    if (!READ_ONLY_METHODS.has(method) && !isImpersonationExit) {
      let session = null;
      try {
        session = await readImpersonationFromCookies(user.id);
      } catch (err) {
        // readImpersonationFromCookies throws outside a request scope.
        // Inside one it shouldn't, but be defensive — a thrown cookie
        // read must NEVER be interpreted as "no session" because that
        // would silently unlock the read-only gate.
        logger.error({
          event: "auth.impersonation.cookie_read_failed",
          userId: user.id,
          err: err instanceof Error ? err.message : String(err),
        });
        return {
          actor: null,
          error: NextResponse.json(
            {
              error: "impersonation_check_failed",
              message:
                "Could not verify impersonation state — request refused.",
            },
            { status: 500 },
          ),
        };
      }

      if (session) {
        logger.warn({
          event: "auth.impersonation.mutation_blocked",
          actorId: user.id,
          method,
          practiceOrgId: session.practiceOrgId,
        });
        return {
          actor: null,
          error: NextResponse.json(
            {
              error: "impersonation_read_only",
              message:
                "Mutations are not permitted while viewing as a practice. " +
                "Exit impersonation to make changes.",
              impersonatedPracticeId: session.practiceOrgId,
            },
            { status: 403 },
          ),
        };
      }
    }
  }

  if (options.rateLimit) {
    const result = options.rateLimit.limiter.check(user.id);
    if (!result.allowed) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((result.resetAt - Date.now()) / 1000),
      );
      return {
        actor: null,
        error: NextResponse.json(
          {
            error: "RATE_LIMITED",
            bucket: options.rateLimit.bucket ?? null,
            retryAfter: retryAfterSec,
          },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSec) },
          },
        ),
      };
    }
  }

  return { actor: user, error: null };
}

async function logMfaBlocked(user: AuthedUser, graceUntil: Date | null): Promise<void> {
  try {
    const { logControllerAction } = await import("./audit-stub");
    await logControllerAction({
      actor: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        organizationId: user.organizationId,
      },
      action: "controller.super_admin.mfa_blocked",
      targetId: user.id,
      after: { graceUntil: graceUntil ? graceUntil.toISOString() : null },
      reason: "super_admin without enrolled MFA — request blocked.",
    });
  } catch (err) {
    logger.error({
      event: "auth.super_admin_mfa.audit_write_failed",
      userId: user.id,
      err,
    });
  }
}
