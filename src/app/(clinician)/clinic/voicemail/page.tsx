// EMR-146 — Voicemail callback queue.
//
// Top-level clinician voicemail page: an inbox prioritized as a
// callback queue. Urgent (keyword-flagged) voicemails surface first,
// then unread by oldest, then a "follow-up" tail of listened-but-
// not-archived rows. Personal data is already redacted server-side
// before it hits this view; only the pertinent clinical summary and
// bullets reach the page.

import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { VoicemailEmptyIllustration } from "@/components/ui/empty-illustrations";
import { formatRelative } from "@/lib/utils/format";
import {
  buildCallbackQueue,
  formatWait,
  readUnreadCounts,
  type VoicemailPriority,
} from "@/lib/communications/voicemail";
import { VoicemailCallbackRow } from "./row";

export const metadata = { title: "Voicemail" };

export default async function ClinicianVoicemailPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const rows = await prisma.voicemail.findMany({
    where: {
      organizationId: orgId,
      status: { in: ["new", "listened"] },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
    },
  });

  const queue = buildCallbackQueue(
    rows.map((r) => ({
      id: r.id,
      status: r.status,
      pertinentSummary: r.pertinentSummary,
      clinicalBullets: r.clinicalBullets,
      createdAt: r.createdAt,
      // carry-along context the row component renders.
      fromNumber: r.fromNumber,
      durationSeconds: r.durationSeconds,
      audioStorageKey: r.audioStorageKey,
      redactedCategories: r.redactedCategories,
      patient: r.patient,
      assignedTo: r.assignedTo,
    })),
  );

  const counts = readUnreadCounts(rows);

  const buckets: Record<VoicemailPriority, typeof queue> = {
    urgent: [],
    normal: [],
    follow_up: [],
  };
  for (const e of queue) buckets[e.priority].push(e);

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="Inbox"
        title="Voicemail callback queue"
        description="HIPAA-redacted transcripts. Urgent calls surface first, then unread by oldest. Mark listened once you've called back."
        actions={
          <Link
            href="/clinic/communications/voicemail"
            className="text-sm text-accent hover:underline"
          >
            Full voicemail console →
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <CountTile label="Unread" value={counts.unread} tone="info" />
        <CountTile label="Listened" value={counts.listened} tone="neutral" />
        <CountTile label="Urgent flags" value={buckets.urgent.length} tone="danger" />
      </div>

      <div className="space-y-8">
        <QueueSection
          title="Urgent — call back now"
          description="Transcript mentioned safety / acute keywords. Redacted summary only."
          tone="danger"
          entries={buckets.urgent}
        />
        <QueueSection
          title="Awaiting first callback"
          description="Unread voicemails in order of oldest first."
          tone="info"
          entries={buckets.normal}
        />
        <QueueSection
          title="Follow-up"
          description="Listened, not yet archived. Confirm the callback closed the loop."
          tone="neutral"
          entries={buckets.follow_up}
        />
      </div>

      {queue.length === 0 && (
        <EmptyState
          illustration={<VoicemailEmptyIllustration />}
          title="Callback queue is clear — nice work"
          description="No outstanding voicemails. Inbound recordings show up here with an AI-redacted clinical summary so you can triage in seconds."
          tips={[
            "Personal data is stripped before the recording is summarized",
            "Reassign any voicemail to a teammate without losing the audit trail",
            "Listened voicemails auto-move to follow-up until you close the loop",
          ]}
        />
      )}
    </PageShell>
  );
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "info" | "neutral" | "danger";
}) {
  return (
    <Card tone="raised">
      <CardContent className="py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-3xl tabular-nums text-text">
            {value}
          </span>
          <Badge tone={tone}>{label}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueSection({
  title,
  description,
  tone,
  entries,
}: {
  title: string;
  description: string;
  tone: "danger" | "info" | "neutral";
  entries: ReturnType<typeof buildCallbackQueue<{
    id: string;
    status: "new" | "listened" | "archived";
    pertinentSummary: string;
    clinicalBullets: string[];
    createdAt: Date;
    fromNumber: string;
    durationSeconds: number | null;
    audioStorageKey: string | null;
    redactedCategories: string[];
    patient: { id: string; firstName: string; lastName: string } | null;
    assignedTo: { firstName: string | null; lastName: string | null } | null;
  }>>;
}) {
  if (entries.length === 0) return null;
  return (
    <Card tone="raised">
      <CardHeader>
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge tone={tone}>{entries.length}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map((e) => (
          <VoicemailCallbackRow
            key={e.voicemail.id}
            entry={{
              id: e.voicemail.id,
              priority: e.priority,
              reason: e.reason,
              waitDisplay: formatWait(e.waitingMinutes),
              status: e.voicemail.status,
              fromNumber: e.voicemail.fromNumber,
              patientId: e.voicemail.patient?.id ?? null,
              patientName: e.voicemail.patient
                ? `${e.voicemail.patient.firstName} ${e.voicemail.patient.lastName}`
                : null,
              durationSeconds: e.voicemail.durationSeconds,
              audioStorageKey: e.voicemail.audioStorageKey,
              pertinentSummary: e.voicemail.pertinentSummary,
              clinicalBullets: e.voicemail.clinicalBullets,
              redactedCategories: e.voicemail.redactedCategories,
              assignedToName: e.voicemail.assignedTo
                ? `${e.voicemail.assignedTo.firstName ?? ""} ${e.voicemail.assignedTo.lastName ?? ""}`.trim()
                : null,
              relativeReceived: formatRelative(e.voicemail.createdAt),
            }}
          />
        ))}
      </CardContent>
    </Card>
  );
}
