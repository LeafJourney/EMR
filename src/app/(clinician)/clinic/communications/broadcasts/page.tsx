// EMR-143 — Outreach campaigns / SMS broadcast.

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
import { CampaignComposeForm } from "./compose-form";
import { SendNowButton } from "./send-now-button";

export const metadata = { title: "Outreach broadcasts" };

export default async function BroadcastsPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const [campaigns, audienceCounts] = await Promise.all([
    prisma.outreachCampaign.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { recipients: true } },
      },
    }),
    Promise.all([
      prisma.patient.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: "active",
          phone: { not: null },
        },
      }),
      prisma.patient.count({
        where: {
          organizationId: orgId,
          deletedAt: null,
          status: "active",
          email: { not: null },
        },
      }),
    ]),
  ]);

  const [activeWithSms, activeWithEmail] = audienceCounts;

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Communications"
        title="Outreach broadcasts"
        description="Practice-wide SMS or email campaigns. Use thoughtfully — patients can unsubscribe at any time."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">New campaign</CardTitle>
              <CardDescription>
                Templates support <code>{`{{firstName}}`}</code> and{" "}
                <code>{`{{lastName}}`}</code>. Active patients with a phone:{" "}
                <strong>{activeWithSms}</strong> · with email:{" "}
                <strong>{activeWithEmail}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CampaignComposeForm />
            </CardContent>
          </Card>
        </div>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Recent campaigns</CardTitle>
            <CardDescription>
              Latest 25 broadcasts in this organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[640px] overflow-y-auto">
            {campaigns.length === 0 ? (
              <EmptyState
                title="No campaigns yet"
                description="Send your first broadcast to see it here."
              />
            ) : (
              campaigns.map((c) => {
                const af = (c.audienceFilter ?? {}) as {
                  dualChannel?: boolean;
                  frequency?: string | null;
                };
                const channelLabel = af.dualChannel
                  ? "SMS+TEXT"
                  : c.channel.toUpperCase();
                const canSend =
                  c.status === "draft" || c.status === "scheduled";
                return (
                  <div
                    key={c.id}
                    className="rounded-lg px-3 py-2 hover:bg-surface-muted"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-text truncate">
                        {c.name}
                      </p>
                      <Badge tone={campaignBadgeTone(c.status)}>
                        {c.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-text-subtle">
                      {channelLabel} · {c._count.recipients} recipients
                      {af.frequency ? ` · ${af.frequency}` : ""}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-text-subtle">
                        {c.createdBy
                          ? `${c.createdBy.firstName} ${c.createdBy.lastName}`
                          : "system"}{" "}
                        · {formatRelative(c.createdAt.toISOString())}
                      </p>
                      {canSend ? <SendNowButton campaignId={c.id} /> : null}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

// EMR-707 bubble colors: Active=green, Scheduled=yellow, Completed=red.
// `sending` is also considered Active. Failed/cancelled keep their own tone.
function campaignBadgeTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "sending":
    case "draft":
      return "success";
    case "scheduled":
      return "warning";
    case "completed":
      return "danger";
    case "failed":
      return "danger";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}
