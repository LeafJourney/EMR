// Clerk-backed session resolver
// This module provides the Clerk implementation of getCurrentUser().
// It's used when AUTH_PROVIDER=clerk in env.
//
// Design:
//   - Clerk holds identity (email, name, auth factors)
//   - Prisma holds RBAC + PHI (Membership, Role, Organization, patient records)
//   - This module bridges them via the User.clerkId field
//
// The user sync is handled by the webhook at /api/webhooks/clerk/route.ts,
// which creates/updates Prisma User rows when Clerk events fire. This module
// just reads the join.

import { cache } from "react";
import { auth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import type { AuthedUser } from "./session";

/**
 * Check whether Clerk is the active auth provider.
 * Toggle via AUTH_PROVIDER=clerk env var.
 */
export function isClerkEnabled(): boolean {
  return process.env.AUTH_PROVIDER === "clerk";
}

/**
 * Load the current user via Clerk + Prisma join.
 *
 * Flow:
 *   1. Clerk auth() returns the userId from the JWT cookie
 *   2. We look up the Prisma User by clerkId
 *   3. If the User doesn't exist yet, we provision it inline (fallback for
 *      webhook lag — the webhook will overwrite with the full data)
 *   4. Return the AuthedUser shape — identical to iron-session's output
 */
export const getCurrentUserFromClerk = cache(async (): Promise<AuthedUser | null> => {
  let clerkUserId: string | null = null;
  try {
    const session = await auth();
    clerkUserId = session.userId;
  } catch (err) {
    // Rethrow Next.js dynamic rendering signals so the builder knows this page is dynamic
    if (
      err instanceof Error &&
      ((err as any).digest === "DYNAMIC_SERVER_USAGE" ||
        err.message.includes("Dynamic server usage") ||
        err.name === "DynamicServerError")
    ) {
      throw err;
    }
    console.warn("[auth] Clerk auth() failed:", err);
  }

  if (!clerkUserId) {
    if (process.env.NODE_ENV !== "production") {
      let email = "clinician@demo.health";
      try {
        const { cookies } = await import("next/headers");
        const cookieStore = cookies();
        const overrideEmail = cookieStore.get("dev_user_email")?.value;
        if (overrideEmail) {
          email = overrideEmail;
        }
      } catch (err) {
        // ignore cookies error in static/build context
      }

      const devUser = await prisma.user.findFirst({
        where: { email },
        include: {
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (devUser) {
        return {
          id: devUser.id,
          email: devUser.email,
          firstName: devUser.firstName,
          lastName: devUser.lastName,
          roles: devUser.memberships.map((m) => m.role),
          organizationId: devUser.memberships[0]?.organizationId ?? null,
          organizationName: devUser.memberships[0]?.organization?.name ?? null,
        };
      }
    }
    return null;
  }

  // Try to find the Prisma user by clerkId
  let user = await prisma.user.findUnique({
    where: { clerkId: clerkUserId },
    include: {
      memberships: {
        include: { organization: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Webhook-lag fallback: provision on first read if missing
  if (!user) {
    const clerkUser = await clerkCurrentUser();
    if (!clerkUser) return null;

    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) return null;

    // Check if a User already exists with this email (legacy iron-session user)
    const existingByEmail = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { organization: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (existingByEmail) {
      // Link the existing user to Clerk
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { clerkId: clerkUserId, lastLoginAt: new Date() },
        include: {
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    } else {
      // Brand-new Clerk user — create a minimal User row.
      // The webhook will follow up with additional data (org assignment, etc.)
      user = await prisma.user.create({
        data: {
          clerkId: clerkUserId,
          email,
          firstName: clerkUser.firstName ?? "",
          lastName: clerkUser.lastName ?? "",
          passwordHash: "", // unused for Clerk users
          lastLoginAt: new Date(),
        },
        include: {
          memberships: {
            include: { organization: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }
  }

  const firstMembership = user.memberships[0];

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: user.memberships.length > 0 ? user.memberships.map((m) => m.role) : ["patient"],
    organizationId: firstMembership?.organizationId ?? null,
    organizationName: firstMembership?.organization?.name ?? null,
  };
});
