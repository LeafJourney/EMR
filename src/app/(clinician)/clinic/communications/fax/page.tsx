import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FaxEmptyIllustration } from "@/components/ui/empty-illustrations";
import { formatRelative } from "@/lib/utils/format";
import { FaxComposeForm } from "./fax-compose";

export const metadata = { title: "Fax" };

export default async function FaxPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const records = await prisma.faxRecord.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      patient: { select: { firstName: true, lastName: true } },
      initiator: { select: { firstName: true, lastName: true } },
    },
  });

  return (
    <PageShell>
      <PageHeader
        eyebrow="Communications"
        title="Fax"
        description="HIPAA-compliant fax — send and receive."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Send a fax</CardTitle>
            <CardDescription>
              Outbound faxes are queued through the practice's fax provider.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FaxComposeForm />
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            {/* EMR-694 — copy reword + 7-year retention notice. */}
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>
              Last 50 inbound and outbound faxes. Older entries archived for
              7 years (2,555 days) per medical-records retention.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[640px] overflow-y-auto">
            {records.length === 0 ? (
              <EmptyState
                illustration={<FaxEmptyIllustration />}
                title="Nothing in flight"
                description="Inbound and outbound faxes will show up here with delivery status, page count, and the patient they belong to."
                tips={[
                  "Outbound faxes ship through the practice's provider in seconds",
                  "Delivery status updates live — no need to refresh the page",
                  "Older entries archive automatically for 7 years per retention",
                ]}
              />
            ) : (
              records.map((fax) => (
                <div
                  key={fax.id}
                  className="flex items-start justify-between rounded-lg px-3 py-2 hover:bg-surface-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text truncate">
                      {fax.direction === "outbound" ? "→" : "←"}{" "}
                      <span className="tabular-nums">{fax.toNumber}</span>
                      {fax.patient && (
                        <span className="text-text-subtle">
                          {" "}
                          · {fax.patient.firstName} {fax.patient.lastName}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-text-subtle">
                      {fax.pageCount ?? "?"} pages ·{" "}
                      {fax.initiator
                        ? `${fax.initiator.firstName} ${fax.initiator.lastName}`
                        : "system"}{" "}
                      · {formatRelative(fax.createdAt.toISOString())}
                    </p>
                    {fax.errorMessage && (
                      <p className="text-[11px] text-text-subtle mt-1 italic">
                        {fax.errorMessage}
                      </p>
                    )}
                  </div>
                  <Badge tone={faxBadgeTone(fax.status)}>{fax.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function faxBadgeTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "delivered":
    case "received":
      return "success";
    case "queued":
    case "sending":
      return "info";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}
