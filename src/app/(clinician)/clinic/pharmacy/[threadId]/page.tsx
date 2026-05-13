// EMR-063 — Pharmacy thread detail + dual sign-off console.
//
// Shows the full message history with the pharmacist, every proposed
// medication change, who has signed, and an apply button that fires
// only after BOTH parties have approved.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { formatRelative } from "@/lib/utils/format";
import { statusLabel } from "@/lib/pharmacy/dual-signoff";
import {
  applyChangeAction,
  postMessageAction,
  proposeChangeAction,
  signChangeAction,
} from "./actions";

export const metadata = { title: "Pharmacy thread" };

export default async function PharmacyThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const user = await requireUser();
  if (!user.organizationId) redirect("/clinic/pharmacy");

  const { threadId } = await params;
  const thread = await prisma.pharmacyCommThread.findUnique({
    where: { id: threadId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      pharmacyContact: true,
      medication: true,
      messages: { orderBy: { createdAt: "asc" } },
      changeRequests: {
        orderBy: { createdAt: "desc" },
        include: { signoffs: true },
      },
    },
  });

  if (!thread || thread.organizationId !== user.organizationId) notFound();

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Pharmacy thread"
        title={thread.subject}
        description={`Conversation with ${thread.pharmacyContact.name} about ${thread.patient.firstName} ${thread.patient.lastName}`}
        actions={
          <Link href="/clinic/pharmacy">
            <Button variant="ghost" size="sm">
              ← All threads
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-4">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Messages</CardTitle>
              <CardDescription>
                Direct line to the pharmacist. Pharmacist replies received by
                fax/phone are transcribed into the thread by clinic staff.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {thread.messages.length === 0 ? (
                <p className="text-sm text-text-subtle">No messages yet.</p>
              ) : (
                thread.messages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-lg bg-surface-muted/50 border border-border/40 p-3"
                  >
                    <div className="flex items-baseline justify-between mb-1">
                      <p className="text-sm font-medium text-text">
                        {m.senderName}{" "}
                        <span className="text-[11px] text-text-subtle font-normal">
                          · {m.senderRole}
                        </span>
                      </p>
                      <p className="text-[11px] text-text-subtle tabular-nums">
                        {formatRelative(m.createdAt)}
                      </p>
                    </div>
                    <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                      {m.body}
                    </p>
                  </div>
                ))
              )}

              <form
                action={postMessageAction}
                className="border-t border-border pt-3 space-y-2"
              >
                <input type="hidden" name="threadId" value={thread.id} />
                <textarea
                  name="body"
                  required
                  rows={3}
                  placeholder="Write to the pharmacist..."
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                />
                <Button type="submit" size="sm" variant="primary">
                  Send message
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Medication change requests</CardTitle>
              <CardDescription>
                Every change here needs both pharmacist and provider sign-off
                before it touches the chart.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {thread.changeRequests.length === 0 ? (
                <p className="text-sm text-text-subtle">
                  No medication changes proposed yet.
                </p>
              ) : (
                thread.changeRequests.map((req) => (
                  <ChangeRequestCard
                    key={req.id}
                    request={req}
                    threadId={thread.id}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Propose a medication change</CardTitle>
              <CardDescription>
                Drafts a request that the pharmacist signs first, then comes
                back to your queue for the second signature.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                action={proposeChangeAction}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              >
                <input type="hidden" name="threadId" value={thread.id} />
                <input type="hidden" name="patientId" value={thread.patient.id} />
                {thread.medication && (
                  <input
                    type="hidden"
                    name="medicationId"
                    value={thread.medication.id}
                  />
                )}
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-subtle">
                    Kind
                  </label>
                  <select
                    name="kind"
                    required
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    defaultValue="dose_change"
                  >
                    <option value="new_medication">New medication</option>
                    <option value="dose_change">Dose change</option>
                    <option value="discontinue">Discontinue</option>
                    <option value="switch_product">Switch product</option>
                    <option value="formulary_substitute">Formulary sub</option>
                    <option value="refill_clarification">
                      Refill clarification
                    </option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-subtle">
                    New medication name
                  </label>
                  <Input
                    name="newName"
                    required
                    defaultValue={thread.medication?.name ?? ""}
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-text-subtle">
                    New dosage
                  </label>
                  <Input
                    name="newDosage"
                    defaultValue={thread.medication?.dosage ?? ""}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[11px] uppercase tracking-wider text-text-subtle">
                    Rationale
                  </label>
                  <textarea
                    name="rationale"
                    required
                    rows={2}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" size="sm" variant="primary">
                    Propose change
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Patient</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text">
                {thread.patient.firstName} {thread.patient.lastName}
              </p>
              {thread.medication && (
                <p className="text-xs text-text-muted mt-1">
                  Current: {thread.medication.name}
                  {thread.medication.dosage
                    ? ` · ${thread.medication.dosage}`
                    : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Pharmacy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <p className="text-text font-medium">
                {thread.pharmacyContact.name}
              </p>
              {thread.pharmacyContact.npi && (
                <p className="text-xs text-text-muted">
                  NPI {thread.pharmacyContact.npi}
                </p>
              )}
              {thread.pharmacyContact.phone && (
                <p className="text-xs text-text-muted">
                  {thread.pharmacyContact.phone}
                </p>
              )}
              {thread.pharmacyContact.fax && (
                <p className="text-xs text-text-muted">
                  Fax: {thread.pharmacyContact.fax}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

interface ChangeRequestWithSignoffs {
  id: string;
  kind: string;
  status: string;
  rationale: string;
  beforeJson: unknown;
  afterJson: unknown;
  appliedAt: Date | null;
  signoffs: {
    id: string;
    party: string;
    decision: string;
    signedName: string;
    signedAt: Date;
    comments: string | null;
  }[];
}

function ChangeRequestCard({
  request,
  threadId,
}: {
  request: ChangeRequestWithSignoffs;
  threadId: string;
}) {
  const after = request.afterJson as Record<string, unknown> | null;
  const pharmacistSig = request.signoffs.find((s) => s.party === "pharmacist");
  const providerSig = request.signoffs.find((s) => s.party === "provider");
  const fullySigned = request.status === "fully_signed";
  const applied = request.status === "applied";
  const rejected = request.status === "rejected";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <Badge tone={badgeTone(request.status)}>
            {kindLabel(request.kind)}
          </Badge>
          <span className="ml-2 text-[11px] text-text-subtle">
            {statusLabel(request.status as never)}
          </span>
        </div>
      </div>

      <p className="text-sm text-text mb-2">
        <span className="font-medium">Proposed:</span>{" "}
        {String(after?.name ?? "—")}
        {after?.dosage ? ` · ${String(after.dosage)}` : ""}
      </p>
      <p className="text-xs text-text-muted mb-3 leading-relaxed">
        {request.rationale}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <SignoffSlot label="Pharmacist" sig={pharmacistSig} />
        <SignoffSlot label="Provider" sig={providerSig} />
      </div>

      {!rejected && !applied && !fullySigned && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {!pharmacistSig && (
            <SignForm
              threadId={threadId}
              requestId={request.id}
              party="pharmacist"
            />
          )}
          {!providerSig && (
            <SignForm
              threadId={threadId}
              requestId={request.id}
              party="provider"
            />
          )}
        </div>
      )}

      {fullySigned && (
        <form
          action={applyChangeAction}
          className="border-t border-border pt-3"
        >
          <input type="hidden" name="threadId" value={threadId} />
          <input type="hidden" name="requestId" value={request.id} />
          <Button type="submit" size="sm" variant="primary">
            Apply to chart
          </Button>
        </form>
      )}

      {applied && (
        <p className="text-xs text-success border-t border-border pt-3">
          ✓ Applied to chart
        </p>
      )}
    </div>
  );
}

function SignForm({
  threadId,
  requestId,
  party,
}: {
  threadId: string;
  requestId: string;
  party: "pharmacist" | "provider";
}) {
  return (
    <form action={signChangeAction} className="flex items-center gap-2">
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="party" value={party} />
      <Button
        type="submit"
        size="sm"
        variant="primary"
        name="decision"
        value="approve"
      >
        Approve as {party}
      </Button>
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        name="decision"
        value="reject"
      >
        Reject
      </Button>
    </form>
  );
}

function SignoffSlot({
  label,
  sig,
}: {
  label: string;
  sig?: {
    decision: string;
    signedName: string;
    signedAt: Date;
    comments: string | null;
  };
}) {
  return (
    <div className="text-xs">
      <p className="text-[10px] uppercase tracking-wider text-text-subtle">
        {label}
      </p>
      {sig ? (
        <>
          <p className="text-text">
            {sig.decision === "approve" ? "✓" : "✗"} {sig.signedName}
          </p>
          <p className="text-text-subtle">{formatRelative(sig.signedAt)}</p>
          {sig.comments && (
            <p className="text-text-muted italic">&ldquo;{sig.comments}&rdquo;</p>
          )}
        </>
      ) : (
        <p className="text-text-subtle italic">Awaiting signature</p>
      )}
    </div>
  );
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
      return "Switch product";
    case "formulary_substitute":
      return "Formulary substitute";
    case "refill_clarification":
      return "Refill clarification";
    default:
      return kind;
  }
}

function badgeTone(
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
