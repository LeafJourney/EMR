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
import { type AuthedUser, requireUser } from "./session";
import { bootstrapSuperAdminIfAllowlisted } from "./super-admin-bootstrap";

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

  if (wantsBootstrap) {
    try {
      await bootstrapSuperAdminIfAllowlisted(user);
    } catch (err) {
      // Bootstrap failure is unusual (DB hiccup) but shouldn't 500 the
      // request — fall through to the role check, which will 403 if the
      // user wasn't already a super-admin.
      // eslint-disable-next-line no-console
      console.warn(
        "[api-gate] bootstrapSuperAdminIfAllowlisted threw — continuing to role check",
        err,
      );
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

  return { actor: user, error: null };
}
