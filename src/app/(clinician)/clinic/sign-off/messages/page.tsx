import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { ApprovalsInboxList, type ApprovalItem } from "./approvals-list";
import { NoraV3Threads } from "./nora-v3-threads";

export const metadata = { title: "Approvals" };

/**
 * Clinician Approvals Inbox
 *
 * The single place a provider goes to see every agent-produced artifact
 * waiting for their sign-off. Today that's primarily Nurse Nora's message
 * drafts. The shape is general: any approval-gated agent output can land
 * here as an {@link ApprovalItem} with a consistent review card.
 *
 * Why this exists: before this page, drafts were scattered inside individual
 * patient charts. A clinician had to know to go look. That defeats the
 * purpose of having agents work for you in the background. Now the drafts
 * come to you.
 */
export default async function ClinicApprovalsPage() {
  const user = await requireUser();

  // ── Load every message draft in the org, newest first ─────────
  const drafts = await prisma.message.findMany({
    where: {
      status: "draft",
      aiDrafted: true,
      thread: { patient: { organizationId: user.organizationId! } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      thread: {
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    take: 100,
  });

  // ── Shape into generic ApprovalItem[] for the client ───────────
  const items: ApprovalItem[] = drafts.map((m) => ({
    id: m.id,
    kind: "message_draft",
    agent: m.senderAgent,
    createdAt: m.createdAt.toISOString(),
    body: m.body,
    patientId: m.thread.patient.id,
    patientFirstName: m.thread.patient.firstName,
    patientLastName: m.thread.patient.lastName,
    threadId: m.threadId,
    threadSubject: m.thread.subject,
    triageUrgency: (m.thread.triageUrgency as ApprovalItem["triageUrgency"]) ?? null,
    triageCategory: m.thread.triageCategory,
    triageSummary: m.thread.triageSummary,
    triageSafetyFlags: Array.isArray(m.thread.triageSafetyFlags)
      ? (m.thread.triageSafetyFlags as string[])
      : null,
  }));

  // Sort: emergency → high → routine → low → null (urgency first)
  const urgencyWeight: Record<string, number> = {
    emergency: 0,
    high: 1,
    routine: 2,
    low: 3,
  };
  items.sort((a, b) => {
    const aw = a.triageUrgency ? urgencyWeight[a.triageUrgency] ?? 4 : 4;
    const bw = b.triageUrgency ? urgencyWeight[b.triageUrgency] ?? 4 : 4;
    if (aw !== bw) return aw - bw;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const emergencyCount = items.filter(
    (i) => i.triageUrgency === "emergency",
  ).length;

  return (
    <PageShell maxWidth="max-w-[1080px]">
      <PageHeader
        eyebrow="Approvals"
        title="Drafts waiting on you"
        description={
          items.length === 0
            ? "Your AI colleagues are up to date. When Nurse Nora or another agent drafts something for a patient, it'll appear here for your sign-off."
            : `${items.length} agent-drafted artifact${items.length === 1 ? "" : "s"} ready for review${
                emergencyCount > 0
                  ? ` · ${emergencyCount} marked EMERGENCY`
                  : ""
              }.`
        }
      />

      {/* ── Nora V3 Conversation Threads ──────────────────── */}
      <NoraV3Threads />

      {items.length === 0 ? (
        <EmptyState
          title="Inbox zero"
          description="Every draft your care-team agents have produced has been reviewed. Nice work."
          action={
            <Link
              href="/clinic/messages"
              className="text-sm text-accent hover:underline"
            >
              Back to messages →
            </Link>
          }
        />
      ) : (
        <ApprovalsInboxList items={items} />
      )}
    </PageShell>
  );
}
