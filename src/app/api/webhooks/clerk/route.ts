// Clerk Webhook Handler — syncs Clerk user events to Prisma
//
// Clerk sends events when users are created, updated, or deleted. We
// mirror those changes into our Prisma User table so downstream features
// (audit log, memberships, patient records) have a consistent identity.
//
// Setup:
//   1. In the Clerk Dashboard → Webhooks, create an endpoint:
//      URL: https://<your-domain>/api/webhooks/clerk
//   2. Subscribe to: user.created, user.updated, user.deleted
//   3. Copy the Signing Secret into CLERK_WEBHOOK_SECRET env var
//
// Security: we verify the svix signature before processing any payload.

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error({ event: "webhook.clerk.secret_missing" });
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  // Verify the svix signature
  const headerPayload = headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(secret);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    logger.error({ event: "webhook.clerk.sig_verification_failed", err });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // Route by event type
  try {
    switch (evt.type) {
      case "user.created":
      case "user.updated":
        await upsertUser(evt.data);
        break;
      case "user.deleted":
        await deleteUser(evt.data);
        break;
      default:
        // Ignore other event types (session, organization, etc.)
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[Clerk Webhook] Failed to process ${evt.type}:`, err);
    return new NextResponse("Internal error", { status: 500 });
  }
}

/**
 * Create or update a Prisma User from a Clerk user payload.
 * Strategy: clerkId is the primary identifier. If a user exists with the
 * same email but no clerkId (legacy iron-session user), we link them.
 */
async function upsertUser(data: any) {
  const clerkId = data.id;
  const email = data.email_addresses?.[0]?.email_address;
  if (!clerkId || !email) {
    console.warn("[Clerk Webhook] Missing clerkId or email, skipping:", data);
    return;
  }

  const firstName = data.first_name ?? "";
  const lastName = data.last_name ?? "";

  // Try clerkId first
  const byClerkId = await prisma.user.findUnique({ where: { clerkId } });
  if (byClerkId) {
    await prisma.user.update({
      where: { clerkId },
      data: { email, firstName, lastName, updatedAt: new Date() },
    });
    return;
  }

  // Fall back to email for legacy user linking
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    await prisma.user.update({
      where: { id: byEmail.id },
      data: { clerkId, firstName, lastName, updatedAt: new Date() },
    });
    return;
  }

  // New user — create with empty passwordHash (Clerk-managed)
  await prisma.user.create({
    data: {
      clerkId,
      email,
      firstName,
      lastName,
      passwordHash: "",
    },
  });

  // Audit the new user creation
  await prisma.auditLog.create({
    data: {
      actorAgent: "clerk:webhook",
      action: "user.created.via.clerk",
      subjectType: "User",
      subjectId: clerkId,
      metadata: { email, firstName, lastName },
    },
  }).catch((e) => console.warn("[Clerk Webhook] Audit log failed:", e));
}

/**
 * Handle Clerk user deletion. We soft-delete by clearing clerkId + email
 * (to free the unique constraint) but keep the row for audit/referential integrity.
 * Clinical data linked to this user ID remains intact.
 */
async function deleteUser(data: any) {
  const clerkId = data.id;
  if (!clerkId) return;

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) return;

  // Preserve the row but mark as deleted
  await prisma.user.update({
    where: { clerkId },
    data: {
      clerkId: null,
      email: `deleted-${user.id}@leafjourney.local`,
      passwordHash: "",
    },
  });

  await prisma.auditLog.create({
    data: {
      actorAgent: "clerk:webhook",
      action: "user.deleted.via.clerk",
      subjectType: "User",
      subjectId: user.id,
      metadata: { clerkId, originalEmail: user.email },
    },
  }).catch((e) => console.warn("[Clerk Webhook] Audit log failed:", e));
}
