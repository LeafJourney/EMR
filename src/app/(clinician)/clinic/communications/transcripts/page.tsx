// EMR-146 — Call transcript review queue.
//
// Shows every AI-summarized call awaiting clinician approval, plus
// recent decisions. Approving attaches the redacted summary to the
// patient chart; rejecting drops it.

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
import { TranscriptsEmptyIllustration } from "@/components/ui/empty-illustrations";
import { formatRelative } from "@/lib/utils/format";
import { TranscriptReviewForm } from "./review-form";

export const metadata = { title: "Transcript review" };

export default async function TranscriptsPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const [pending, recent] = await Promise.all([
    prisma.callTranscript.findMany({
      where: { organizationId: orgId, status: "pending_review" },
      orderBy: { createdAt: "asc" },
      include: {
        call: {
          include: {
            patient: { select: { firstName: true, lastName: true } },
            providerUser: { select: { firstName: true, lastName: true } },
            initiator: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.callTranscript.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["approved", "rejected"] },
      },
      orderBy: { reviewedAt: "desc" },
      take: 12,
      include: {
        call: {
          include: {
            patient: { select: { firstName: true, lastName: true } },
          },
        },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Communications"
        title="Transcript review"
        description="AI captures only pertinent clinical info from calls. Review the redacted summary before it lands on the chart."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-medium text-text-muted uppercase tracking-wider">
            Pending ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <EmptyState
              illustration={<TranscriptsEmptyIllustration />}
              title="Queue clear — every transcript reviewed"
              description="New AI-summarized calls land here for a quick approve or reject. Your approved summaries are already on the chart."
              tips={[
                "Approving attaches the redacted summary to the patient chart",
                "Rejecting drops the AI summary — nothing reaches the chart",
                "Decisions show up in the recent panel for the next 12 reviews",
              ]}
            />
          ) : (
            pending.map((t) => {
              const counterparty = t.call.patient
                ? `${t.call.patient.firstName} ${t.call.patient.lastName}`
                : t.call.providerUser
                  ? `${t.call.providerUser.firstName} ${t.call.providerUser.lastName}`
                  : t.call.externalNumber ?? "Unknown";
              return (
                <Card key={t.id} tone="raised">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">
                          {counterparty}
                        </CardTitle>
                        <CardDescription>
                          {t.call.channel} · {t.call.direction} · captured{" "}
                          {formatRelative(t.createdAt.toISOString())}
                        </CardDescription>
                      </div>
                      {t.redactedCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1 max-w-[200px] justify-end">
                          {t.redactedCategories.map((c) => (
                            <Badge key={c} tone="warning">
                              {c} stripped
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-wider text-text-subtle mb-1">
                        Pertinent summary
                      </p>
                      <p className="text-sm text-text leading-relaxed">
                        {t.pertinentSummary}
                      </p>
                    </div>
                    {t.clinicalBullets.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-text-subtle mb-1">
                          Clinical bullets
                        </p>
                        <ul className="space-y-1 list-disc list-inside text-sm text-text">
                          {t.clinicalBullets.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <TranscriptReviewForm transcriptId={t.id} />
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Recent decisions</CardTitle>
            <CardDescription>Last 12 reviews.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[640px] overflow-y-auto">
            {recent.length === 0 ? (
              <EmptyState
                title="No decisions yet"
                description="Once you approve or reject a transcript it will show up here so the team can see what was added to charts."
                className="p-6"
              />
            ) : (
              recent.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg px-3 py-2 hover:bg-surface-muted"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-text truncate">
                      {t.call.patient
                        ? `${t.call.patient.firstName} ${t.call.patient.lastName}`
                        : "External"}
                    </p>
                    <Badge tone={t.status === "approved" ? "success" : "neutral"}>
                      {t.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-text-subtle mt-1">
                    {t.reviewedBy
                      ? `${t.reviewedBy.firstName} ${t.reviewedBy.lastName}`
                      : "—"}{" "}
                    ·{" "}
                    {t.reviewedAt
                      ? formatRelative(t.reviewedAt.toISOString())
                      : ""}
                  </p>
                  {t.reviewerNote && (
                    <p className="text-xs text-text-muted mt-1 italic">
                      “{t.reviewerNote}”
                    </p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
