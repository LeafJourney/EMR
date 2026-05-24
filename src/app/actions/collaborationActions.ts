"use server";

/**
 * Server actions for the collaboration primitives.
 *
 * WIP — Prisma schema is off-limits in this PR, so the only durable action
 * here is `listOrgMembersForMention`, which simply returns the existing
 * `User` roster scoped to the caller's org. Comment create/update/delete
 * live in localStorage on the client until a `Comment` model lands.
 */
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import type { CommentAuthor } from "@/lib/collaboration/comments";

/**
 * Return the org's user roster for @mention autocomplete. Excludes the
 * caller (you can't mention yourself usefully) and any soft-deleted users.
 * Cheap to call: a single indexed query on `organizationId`.
 */
export async function listOrgMembersForMention(): Promise<CommentAuthor[]> {
  const user = await requireUser();
  if (!user.organizationId) return [];

  const members = await prisma.user.findMany({
    where: {
      memberships: {
        some: { organizationId: user.organizationId },
      },
      id: { not: user.id },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 200,
  });

  return members.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    avatarUrl: null,
  }));
}

/**
 * Return a `CommentAuthor` payload for the currently-signed-in user. The
 * comment thread component uses this to stamp new comments without having
 * to round-trip auth state through the client.
 */
export async function getCurrentCommentAuthor(): Promise<CommentAuthor> {
  const user = await requireUser();
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    avatarUrl: null,
  };
}
