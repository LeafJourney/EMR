// EMR-146 — HIPAA voicemail inbox.
//
// Inbound voicemails land in the queue with a redacted transcript
// summary. A clinician can listen to the recording, mark the message
// listened, archive it, or reassign to a teammate. All bodies are
// redacted before the page sees them — personal data never reaches
// the client.

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
import { formatRelative } from "@/lib/utils/format";
import { VoicemailRow } from "./row";
import { LogVoicemailForm } from "./log-form";

export const metadata = { title: "Voicemail" };

export default async function VoicemailPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const [active, archived, teammates] = await Promise.all([
    prisma.voicemail.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["new", "listened"] },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        patient: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
        listenedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.voicemail.findMany({
      where: { organizationId: orgId, status: "archived" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        memberships: {
          some: {
            organizationId: orgId,
            role: { in: ["clinician", "operator", "practice_owner"] },
          },
        },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      take: 50,
    }),
  ]);

  const newCount = active.filter((v) => v.status === "new").length;

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Communications"
        title="Voicemail"
        description="HIPAA-compliant voicemail with AI transcription. Personal data is redacted; only clinical content is summarized."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
            Inbox ({active.length})
            {newCount > 0 && (
              <Badge tone="info" className="ml-2">
                {newCount} new
              </Badge>
            )}
          </h2>
          {active.length === 0 ? (
            <EmptyState
              title="No voicemails to review"
              description="Inbound recordings will appear here once a caller leaves a message."
            />
          ) : (
            active.map((vm) => (
              <VoicemailRow
                key={vm.id}
                voicemail={{
                  id: vm.id,
                  fromNumber: vm.fromNumber,
                  patientName: vm.patient
                    ? `${vm.patient.firstName} ${vm.patient.lastName}`
                    : null,
                  durationSeconds: vm.durationSeconds,
                  audioStorageKey: vm.audioStorageKey,
                  pertinentSummary: vm.pertinentSummary,
                  clinicalBullets: vm.clinicalBullets,
                  redactedCategories: vm.redactedCategories,
                  status: vm.status,
                  assignedToName: vm.assignedTo
                    ? `${vm.assignedTo.firstName} ${vm.assignedTo.lastName}`
                    : null,
                  listenedByName: vm.listenedBy
                    ? `${vm.listenedBy.firstName} ${vm.listenedBy.lastName}`
                    : null,
                  createdAt: vm.createdAt.toISOString(),
                }}
                teammates={teammates.map((t) => ({
                  id: t.id,
                  name: `${t.firstName} ${t.lastName}`,
                }))}
              />
            ))
          )}
        </div>

        <div className="space-y-4">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Log a voicemail</CardTitle>
              {/* EMR-692 — reworded into plain language. */}
              <CardDescription>
                The front desk removes private health information from the
                notes before saving them so no personal information is
                stored in the EMR.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LogVoicemailForm
                teammates={teammates.map((t) => ({
                  id: t.id,
                  name: `${t.firstName} ${t.lastName}`,
                }))}
              />
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Archived</CardTitle>
              {/* EMR-692 — confirm 30-day auto-delete policy. */}
              <CardDescription>
                Last 10 archived voicemails. Auto-delete 30 days after
                recording date.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {archived.length === 0 ? (
                <EmptyState
                  title="Nothing archived yet"
                  description="Archived voicemails appear here for audit."
                />
              ) : (
                archived.map((vm) => (
                  <div
                    key={vm.id}
                    className="rounded-lg px-3 py-2 hover:bg-surface-muted"
                  >
                    <p className="text-sm text-text truncate">
                      {vm.patient
                        ? `${vm.patient.firstName} ${vm.patient.lastName}`
                        : vm.fromNumber}
                    </p>
                    <p className="text-[11px] text-text-subtle truncate">
                      {vm.pertinentSummary}
                    </p>
                    <p className="text-[10px] text-text-subtle mt-1">
                      {formatRelative(vm.createdAt.toISOString())}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
