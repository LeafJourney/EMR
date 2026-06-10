import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  triageThread,
  PRIORITY_CONFIG,
  CATEGORY_LABELS,
  type TriagedMessage,
  type MessagePriority,
  type MessageCategory,
} from "@/lib/domain/smart-inbox";
import { isResolvedMarker } from "./resolve-marker";
import { SmartInboxView } from "./smart-inbox";
import { MorningBriefView } from "./brief-view";
import { isThreadResolved, unreadInboundCount } from "@/lib/messaging/thread-state";

export const metadata = { title: "Smart Inbox" };

// EMR-708 — supported `filter=` values. `brief` renders the merged
// Morning Brief view (previously at /clinic/morning-brief); any other
// value falls through to the normal Smart Inbox.
const SUPPORTED_FILTERS = ["brief"] as const;
type SupportedFilter = (typeof SUPPORTED_FILTERS)[number];

function isSupportedFilter(value: string | undefined): value is SupportedFilter {
  return !!value && (SUPPORTED_FILTERS as readonly string[]).includes(value);
}

export default async function ClinicMessagesPage({
  searchParams,
}: {
  // EMR-708 — `filter=brief` is the inbound filter from the redirected
  // /clinic/morning-brief route. The inbox shows a Brief banner + scopes
  // the list to brief-flagged threads.
  searchParams?: { thread?: string; filter?: string };
}) {
  const user = await requireUser();
  const filter = isSupportedFilter(searchParams?.filter) ? searchParams!.filter : null;

  if (filter === "brief") {
    return (
      <PageShell maxWidth="max-w-[1400px]">
        <PageHeader
          eyebrow="Messages · Brief"
          title={`Good morning, ${user.firstName}.`}
          description="Your daily quality checklist. Folded into the inbox as the brief filter."
        />
        <div className="mb-4 flex items-center gap-2 text-xs">
          <Link
            href="/clinic/messages"
            className="rounded-full border border-border bg-surface px-3 py-1 text-text-muted hover:bg-surface-muted"
          >
            All threads
          </Link>
          <span className="rounded-full border border-accent bg-accent/10 px-3 py-1 text-text">
            Brief
          </span>
        </div>
        <MorningBriefView />
      </PageShell>
    );
  }

  const [threads, patients] = await Promise.all([
    prisma.messageThread.findMany({
    where: { patient: { organizationId: user.organizationId! } },
    orderBy: { lastMessageAt: "desc" },
    include: {
      patient: {
        select: { id: true, userId: true, firstName: true, lastName: true },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        include: {
          sender: {
            select: { firstName: true, lastName: true },
          },
        },
      },
      // EMR-604 — pull call records so the thread view can interleave them
      // chronologically as WhatsApp-style bubbles.
      callLogs: {
        select: {
          id: true,
          channel: true,
          direction: true,
          status: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
        },
        orderBy: { startedAt: "asc" },
      },
    },
      take: 50,
    }),
    prisma.patient.findMany({
      where: { organizationId: user.organizationId! },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
    }),
  ]);

  // EMR-659 — heuristic until Message gains a real attachments column. We flag
  // a thread as carrying attachments when any message body mentions a file
  // URL, a familiar attachment extension, or the words "attached/attachment".
  const ATTACHMENT_RE =
    /(https?:\/\/\S+\.(?:pdf|docx?|jpe?g|png|heic)\b)|(\b\S+\.(?:pdf|docx?|jpe?g|png|heic)\b)|\battach(?:ed|ment)\b/i;
  function countAttachments(messages: { body: string }[]): number {
    let n = 0;
    for (const m of messages) {
      const matches = m.body.match(
        /(https?:\/\/\S+\.(?:pdf|docx?|jpe?g|png|heic)\b)|(\b[A-Za-z0-9._-]+\.(?:pdf|docx?|jpe?g|png|heic)\b)/gi,
      );
      if (matches) n += matches.length;
      else if (ATTACHMENT_RE.test(m.body)) n += 1;
    }
    return n;
  }

  // Triage each thread and build serialized data for the client component
  const triaged: TriagedMessage[] = threads.map((t) => {
    const messagesForTriage = t.messages.map((m) => ({
      body: m.body,
      senderUserId: m.senderUserId,
      senderAgent: m.senderAgent,
      createdAt: m.createdAt.toISOString(),
    }));

    const result = triageThread(messagesForTriage, t.patient.userId);

    const unreadCount = unreadInboundCount(t.messages, user.id);

    const attachmentCount = countAttachments(t.messages);

    // Build a short summary from the most recent patient message
    const latestPatientMsg = t.messages.find(
      (m) =>
        m.senderUserId === t.patient.userId ||
        (!m.senderUserId && !m.senderAgent),
    );
    const summary = latestPatientMsg
      ? latestPatientMsg.body.length > 120
        ? latestPatientMsg.body.slice(0, 120) + "..."
        : latestPatientMsg.body
      : t.subject;

    return {
      threadId: t.id,
      subject: t.subject,
      patientName: `${t.patient.firstName} ${t.patient.lastName}`,
      patientId: t.patient.id,
      lastMessageAt: t.lastMessageAt.toISOString(),
      messageCount: t.messages.length,
      unreadCount,
      priority: result.priority,
      category: result.category,
      summary,
      triageReason: result.triageReason,
      suggestedAction: result.suggestedAction,
      needsClinician: result.needsClinician,
      attachmentCount,
    };
  });

  // EMR-657 — fetch active meds for all patients so the avatar tooltip can
  // show "Current Meds" on hover without a separate round-trip.
  // EMR-1111 (FO-M3) — medications are prescription data: now that front
  // office works this inbox, only roles with prescriptions.read get the
  // meds tooltip; others get an empty map (the tooltip simply doesn't show).
  const uniquePatientIds = [...new Set(threads.map((t) => t.patient.id))];
  const activeMeds = uniquePatientIds.length > 0 &&
    hasPermission(user, "prescriptions.read")
    ? await prisma.patientMedication.findMany({
        where: { patientId: { in: uniquePatientIds }, active: true },
        select: { patientId: true, name: true, dosage: true },
        orderBy: { name: "asc" },
      })
    : [];

  const patientMeds: Record<string, { name: string; dosage: string | null }[]> = {};
  for (const med of activeMeds) {
    (patientMeds[med.patientId] ??= []).push({ name: med.name, dosage: med.dosage });
  }

  // Serialize full thread messages for the detail view
  const threadMessages = threads.map((t) => ({
    threadId: t.id,
    patientId: t.patient.id,
    patientName: `${t.patient.firstName} ${t.patient.lastName}`,
    subject: t.subject,
    // EMR-808 — resolved while the resolve mark is at/after the last activity;
    // a newer patient reply (lastMessageAt > resolvedAt) re-opens the thread.
    isResolved: isThreadResolved(t.resolvedAt, t.lastMessageAt),
    messages: t.messages.map((m) => ({
      id: m.id,
      body: m.body,
      status: m.status,
      aiDrafted: m.aiDrafted,
      senderUserId: m.senderUserId,
      senderAgent: m.senderAgent,
      sender: m.sender
        ? { firstName: m.sender.firstName, lastName: m.sender.lastName }
        : null,
      createdAt: m.createdAt.toISOString(),
      channel: m.channel,
      delivery: m.delivery,
      deliveryDetail: m.deliveryDetail,
    })),
    callLogs: t.callLogs.map((c) => ({
      id: c.id,
      channel: c.channel as string,
      direction: c.direction as string,
      status: c.status as string,
      startedAt: c.startedAt.toISOString(),
      endedAt: c.endedAt?.toISOString() ?? null,
      durationSeconds: c.durationSeconds,
    })),
  }));

  // EMR-660 — Hide resolved threads from the inbox until the patient sends
  // a new reply (which lands after the [[RESOLVED]] sentinel, making it
  // no longer the last message). The resolveThread action deliberately
  // skips bumping lastMessageAt for the same reason; this is the
  // server-side complement that actually removes them from the feed.
  //
  // We cast to a narrow interface for the detection loop only; the final
  // filtered arrays keep the `any[]` inference so they stay assignable to
  // the ThreadMessageData[] prop expected by SmartInboxView.
  const resolvedThreadIds = new Set<string>();
  for (const t of threadMessages) {
    const msgs = [...t.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = msgs[msgs.length - 1];
    if (last && isResolvedMarker(last.body)) resolvedThreadIds.add(t.threadId);
  }

  const activeTriaged = triaged.filter((t) => !resolvedThreadIds.has(t.threadId));
  const activeThreadMessages: typeof threadMessages = [];
  for (const t of threadMessages) {
    if (!resolvedThreadIds.has(t.threadId)) activeThreadMessages.push(t);
  }

  return (
    <PageShell maxWidth="max-w-[1400px]">
      <PageHeader
        eyebrow="Messages"
        title="Smart Inbox"
        description="AI-triaged message queue. Threads are prioritized so urgent patient needs surface first."
      />
      {/* EMR-708 — filter chips. Brief is the merged Morning Brief view. */}
      <div className="mb-4 flex items-center gap-2 text-xs">
        <span className="rounded-full border border-accent bg-accent/10 px-3 py-1 text-text">
          All threads
        </span>
        <Link
          href="/clinic/messages?filter=brief"
          className="rounded-full border border-border bg-surface px-3 py-1 text-text-muted hover:bg-surface-muted"
        >
          Brief
        </Link>
      </div>
      <SmartInboxView
        triaged={activeTriaged}
        threadMessages={activeThreadMessages}
        currentUserId={user.id}
        initialThreadId={searchParams?.thread}
        initialFilter={searchParams?.filter}
        patients={patients}
        patientMeds={patientMeds}
      />
    </PageShell>
  );
}
