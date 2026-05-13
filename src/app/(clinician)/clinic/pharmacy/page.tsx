// EMR-063 — Pharmacy communication console with dual sign-off.
//
// Lists every active pharmacy thread for the org, surfaces any
// medication-change requests waiting on the provider's signature, and
// links into the thread detail page where messages and sign-offs
// happen. The dual sign-off state machine is enforced server-side in
// src/lib/pharmacy/dual-signoff.ts; this page is a read-only fan-out.

import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelative } from "@/lib/utils/format";
import { statusLabel } from "@/lib/pharmacy/dual-signoff";

export const metadata = { title: "Pharmacy" };

export default async function PharmacyPage() {
  const user = await requireUser();
  if (!user.organizationId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const orgId = user.organizationId;

  const [threads, awaitingProvider, awaitingPharmacist, fullySigned] =
    await Promise.all([
      prisma.pharmacyCommThread.findMany({
        where: { organizationId: orgId, status: { not: "cancelled" } },
        orderBy: { lastMessageAt: "desc" },
        take: 24,
        include: {
          patient: { select: { firstName: true, lastName: true } },
          pharmacyContact: { select: { name: true, phone: true } },
          medication: { select: { name: true, dosage: true } },
          changeRequests: {
            select: { id: true, status: true, kind: true, rationale: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      prisma.medicationChangeRequest.count({
        where: { organizationId: orgId, status: "pharmacist_signed" },
      }),
      prisma.medicationChangeRequest.count({
        where: { organizationId: orgId, status: "provider_signed" },
      }),
      prisma.medicationChangeRequest.count({
        where: { organizationId: orgId, status: "fully_signed" },
      }),
    ]);

  const openThreads = threads.filter((t) =>
    ["open", "awaiting_pharmacist", "awaiting_provider"].includes(t.status),
  );
  const resolvedThreads = threads.filter((t) => t.status === "resolved");

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Pharmacy"
        title="Pharmacy communications"
        description="Direct line to the pharmacist for clarifications and medication recommendations. Every medication change needs both pharmacist AND provider sign-off before it touches the chart."
        actions={
          <Link href="/clinic/pharmacy/new">
            <Button variant="primary" size="sm">
              New thread
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <MetricTile
          label="Waiting on you"
          value={awaitingProvider}
          accent={awaitingProvider > 0 ? "amber" : "none"}
          hint="Pharmacist signed — provider sign-off pending"
        />
        <MetricTile
          label="Waiting on pharmacist"
          value={awaitingPharmacist}
          accent="none"
          hint="You signed — pharmacist sign-off pending"
        />
        <MetricTile
          label="Ready to apply"
          value={fullySigned}
          accent="forest"
          hint="Both signatures captured"
        />
        <MetricTile
          label="Open threads"
          value={openThreads.length}
          accent="none"
          hint="Active conversations"
        />
      </div>

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Open threads</CardTitle>
          <CardDescription>
            Latest message first. Click into a thread to read, reply, or sign off
            on a medication change.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {openThreads.length === 0 ? (
            <EmptyState
              title="No open pharmacy threads"
              description="Start one from a patient's medication list or use the New thread button above."
            />
          ) : (
            openThreads.map((t) => <ThreadRow key={t.id} thread={t} />)
          )}
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Recently resolved</CardTitle>
          <CardDescription>
            Threads closed in the last 30 days — kept for audit trail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {resolvedThreads.length === 0 ? (
            <EmptyState
              title="No recent activity"
              description="Resolved threads will appear here."
            />
          ) : (
            resolvedThreads.map((t) => <ThreadRow key={t.id} thread={t} />)
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

interface ThreadRowData {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: Date;
  patient: { firstName: string; lastName: string };
  pharmacyContact: { name: string };
  medication: { name: string; dosage: string | null } | null;
  changeRequests: { id: string; status: string; kind: string; rationale: string }[];
}

function ThreadRow({ thread }: { thread: ThreadRowData }) {
  const latestRequest = thread.changeRequests[0];
  return (
    <Link
      href={`/clinic/pharmacy/${thread.id}`}
      className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_180px_140px] items-center gap-3 rounded-lg px-3 py-3 hover:bg-surface-muted"
    >
      <div className="min-w-0">
        <p className="text-sm text-text font-medium truncate">
          {thread.patient.lastName}, {thread.patient.firstName.charAt(0)}.{" "}
          <span className="text-text-subtle font-normal">— {thread.subject}</span>
        </p>
        {thread.medication && (
          <p className="text-[11px] text-text-subtle truncate">
            {thread.medication.name}
            {thread.medication.dosage ? ` · ${thread.medication.dosage}` : ""}
          </p>
        )}
        <p className="text-[11px] text-text-subtle truncate">
          → {thread.pharmacyContact.name}
        </p>
      </div>
      <div className="min-w-0">
        {latestRequest ? (
          <>
            <Badge tone={requestTone(latestRequest.status)}>
              {kindLabel(latestRequest.kind)}
            </Badge>
            <p className="text-[11px] text-text-subtle truncate mt-1">
              {statusLabel(latestRequest.status as never)}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-text-subtle">No change proposed yet</p>
        )}
      </div>
      <Badge tone={threadTone(thread.status)}>{statusReadable(thread.status)}</Badge>
      <p className="text-xs text-text-subtle tabular-nums">
        {formatRelative(thread.lastMessageAt)}
      </p>
    </Link>
  );
}

function statusReadable(status: string): string {
  switch (status) {
    case "open":
      return "Open";
    case "awaiting_pharmacist":
      return "Awaiting pharmacist";
    case "awaiting_provider":
      return "Awaiting you";
    case "resolved":
      return "Resolved";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function threadTone(
  status: string,
):
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "info"
  | "highlight"
  | "accent" {
  switch (status) {
    case "awaiting_provider":
      return "warning";
    case "awaiting_pharmacist":
      return "info";
    case "resolved":
      return "success";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "new_medication":
      return "New medication";
    case "dose_change":
      return "Dose change";
    case "discontinue":
      return "Discontinue";
    case "switch_product":
      return "Switch";
    case "formulary_substitute":
      return "Formulary sub";
    case "refill_clarification":
      return "Refill clarification";
    default:
      return kind;
  }
}

function requestTone(
  status: string,
):
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "info"
  | "highlight"
  | "accent" {
  switch (status) {
    case "fully_signed":
    case "applied":
      return "success";
    case "rejected":
    case "withdrawn":
      return "danger";
    case "provider_signed":
      return "info";
    case "pharmacist_signed":
      return "warning";
    default:
      return "neutral";
  }
}
