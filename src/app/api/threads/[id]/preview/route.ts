// GET /api/threads/[id]/preview
//
// Lightweight thread summary for the HoverCard primitive. Resolves a
// `?kind=patient|provider` against either MessageThread (patient↔clinic)
// or ProviderMessageThread (provider↔provider). Returns subject,
// participant/patient header, last message preview, and unread count
// from the caller's perspective.
//
// Auth: any signed-in user in the thread's organization. Provider threads
// additionally require the caller to be a participant (or it returns 404).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

const PREVIEW_BODY_LIMIT = 180;

function snippet(body: string | null | undefined): string {
  const trimmed = (body ?? "").trim().replace(/\s+/g, " ");
  if (trimmed.length <= PREVIEW_BODY_LIMIT) return trimmed;
  return `${trimmed.slice(0, PREVIEW_BODY_LIMIT - 1)}…`;
}

export async function GET(request: NextRequest, { params }: Params) {
  const gate = await requireApiAuth();
  if (gate.error) return gate.error;
  const orgId = gate.actor.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "no_org" }, { status: 403 });
  }

  const kind = new URL(request.url).searchParams.get("kind") ?? "patient";

  if (kind === "provider") {
    const thread = await prisma.providerMessageThread.findFirst({
      where: { id: params.id, organizationId: orgId },
      select: {
        id: true,
        subject: true,
        lastMessageAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        participants: {
          select: {
            userId: true,
            lastReadAt: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { bodyLength: true, createdAt: true },
        },
      },
    });
    if (!thread) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const me = thread.participants.find((p) => p.userId === gate.actor.id);
    if (!me) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const unread = await prisma.providerMessage.count({
      where: {
        threadId: thread.id,
        createdAt: me.lastReadAt ? { gt: me.lastReadAt } : undefined,
      },
    });
    return NextResponse.json({
      kind: "provider" as const,
      id: thread.id,
      subject: thread.subject,
      participantCount: thread.participants.length,
      participants: thread.participants
        .filter((p) => p.userId !== gate.actor.id)
        .slice(0, 4)
        .map((p) => ({
          userId: p.userId,
          name: `${p.user.firstName} ${p.user.lastName}`.trim(),
        })),
      patientName: thread.patient
        ? `${thread.patient.firstName} ${thread.patient.lastName}`.trim()
        : null,
      patientId: thread.patient?.id ?? null,
      // Provider messages are encrypted at rest — surface length only,
      // never the ciphertext or any decoded body.
      lastMessagePreview: thread.messages[0]
        ? `${thread.messages[0].bodyLength} character message`
        : null,
      lastMessageAt: thread.lastMessageAt.toISOString(),
      unreadCount: unread,
    });
  }

  // Default: patient-facing MessageThread.
  const thread = await prisma.messageThread.findFirst({
    where: { id: params.id, patient: { organizationId: orgId } },
    select: {
      id: true,
      subject: true,
      lastMessageAt: true,
      triageUrgency: true,
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true, status: true },
      },
      _count: { select: { messages: true } },
    },
  });
  if (!thread) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // "Unread" approximation for the clinic side: count messages with
  // status=sent that haven't been marked read. Cheap & avoids inventing
  // a per-clinician read pointer in this preview endpoint.
  const unread = await prisma.message.count({
    where: { threadId: thread.id, status: "sent" },
  });

  return NextResponse.json({
    kind: "patient" as const,
    id: thread.id,
    subject: thread.subject,
    patientName: `${thread.patient.firstName} ${thread.patient.lastName}`.trim(),
    patientId: thread.patient.id,
    messageCount: thread._count.messages,
    participantCount: 2, // patient + clinic
    lastMessagePreview: snippet(thread.messages[0]?.body),
    lastMessageAt: thread.lastMessageAt.toISOString(),
    triageUrgency: thread.triageUrgency,
    unreadCount: unread,
  });
}
