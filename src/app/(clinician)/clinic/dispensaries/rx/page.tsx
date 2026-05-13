// EMR-091 — Clinician console for cannabis prescriptions + dispensary
// fulfilment. Lists Rx in their workflow buckets so the provider can
// see at a glance: drafts they haven't sent, scripts the dispensary
// has acted on, and dispenses in flight.

import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
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
import { formatDate, formatRelative } from "@/lib/utils/format";
import { formatMoney } from "@/lib/domain/billing";

export const metadata = { title: "Cannabis Rx" };

export default async function CannabisRxPage() {
  const user = await requireUser();
  if (!user.organizationId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const orgId = user.organizationId;

  const [drafts, sent, approved, dispenses, expiringCards] = await Promise.all([
    prisma.cannabisRx.findMany({
      where: { organizationId: orgId, status: "draft" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        patient: { select: { firstName: true, lastName: true } },
        dispensary: { select: { name: true } },
      },
    }),
    prisma.cannabisRx.findMany({
      where: { organizationId: orgId, status: "sent_to_dispensary" },
      orderBy: { sentAt: "desc" },
      take: 10,
      include: {
        patient: { select: { firstName: true, lastName: true } },
        dispensary: { select: { name: true } },
      },
    }),
    prisma.cannabisRx.findMany({
      where: {
        organizationId: orgId,
        status: { in: ["approved_by_dispensary", "partially_dispensed"] },
      },
      orderBy: { approvedAt: "desc" },
      take: 10,
      include: {
        patient: { select: { firstName: true, lastName: true } },
        dispensary: { select: { name: true } },
      },
    }),
    prisma.dispensaryDispense.findMany({
      where: { organizationId: orgId },
      orderBy: { dispensedAt: "desc" },
      take: 10,
      include: {
        patient: { select: { firstName: true, lastName: true } },
        dispensary: { select: { name: true } },
      },
    }),
    prisma.medicalCannabisCard.findMany({
      where: {
        organizationId: orgId,
        status: "active",
        expiresOn: {
          gt: new Date(),
          lt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      take: 8,
      orderBy: { expiresOn: "asc" },
    }),
  ]);

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Dispensary"
        title="Cannabis prescriptions"
        description="Medical cannabis Rx flow — prescribed by a provider, fulfilled by a licensed dispensary, forwarded to the state registry. Recreational use is not handled here."
        actions={
          <Link href="/clinic/dispensaries">
            <Button variant="ghost" size="sm">
              Dispensary directory
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <MetricTile label="Drafts" value={drafts.length} accent="none" />
        <MetricTile
          label="Awaiting dispensary"
          value={sent.length}
          accent={sent.length > 0 ? "amber" : "none"}
        />
        <MetricTile
          label="In flight"
          value={approved.length}
          accent="forest"
          hint="Approved or partially dispensed"
        />
        <MetricTile
          label="Cards expiring soon"
          value={expiringCards.length}
          accent={expiringCards.length > 0 ? "amber" : "none"}
          hint="Within 30 days"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Drafts</CardTitle>
            <CardDescription>
              Not yet sent to a dispensary.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {drafts.length === 0 ? (
              <EmptyState
                title="No drafts"
                description="Write a new cannabis Rx from a patient's chart."
              />
            ) : (
              drafts.map((rx) => <RxRow key={rx.id} rx={rx} />)
            )}
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Sent to dispensary</CardTitle>
            <CardDescription>
              Waiting for dispensary approval or rejection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {sent.length === 0 ? (
              <EmptyState
                title="Nothing waiting"
                description="Approved Rx will move to the In-flight column."
              />
            ) : (
              sent.map((rx) => <RxRow key={rx.id} rx={rx} />)
            )}
          </CardContent>
        </Card>
      </div>

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">In flight</CardTitle>
          <CardDescription>
            Approved or partially dispensed — the dispensary has authorization
            to hand off product.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {approved.length === 0 ? (
            <EmptyState
              title="No in-flight Rx"
              description="Once a dispensary approves a script, it appears here."
            />
          ) : (
            approved.map((rx) => <RxRow key={rx.id} rx={rx} />)
          )}
        </CardContent>
      </Card>

      <Card tone="raised" className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Recent dispenses</CardTitle>
          <CardDescription>
            Latest handoffs. Each row carries a budtender e-signature and is
            forwarded nightly to the state registry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {dispenses.length === 0 ? (
            <EmptyState
              title="No dispenses yet"
              description="Dispenses appear once the dispensary records a fulfilment."
            />
          ) : (
            dispenses.map((d) => <DispenseRow key={d.id} dispense={d} />)
          )}
        </CardContent>
      </Card>

      {expiringCards.length > 0 && (
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Medical cards expiring soon</CardTitle>
            <CardDescription>
              Patients whose MMJ card expires in the next 30 days. Renew before
              writing additional cannabis Rx.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {expiringCards.map((card) => (
              <div
                key={card.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_140px_140px] items-center gap-3 rounded-lg px-3 py-2 text-sm"
              >
                <p className="text-text">
                  {card.patient.lastName}, {card.patient.firstName.charAt(0)}.
                </p>
                <p className="text-text-subtle text-xs">
                  Card #{card.cardNumber}
                </p>
                <p className="text-text-subtle text-xs tabular-nums">
                  Expires {formatDate(card.expiresOn)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

interface RxRowData {
  id: string;
  productName: string;
  productFormat: string;
  quantity: number;
  unit: string;
  status: string;
  createdAt: Date;
  patient: { firstName: string; lastName: string };
  dispensary: { name: string };
}

function RxRow({ rx }: { rx: RxRowData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_140px_120px] items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-muted">
      <div className="min-w-0">
        <p className="text-sm text-text font-medium truncate">
          {rx.patient.lastName}, {rx.patient.firstName.charAt(0)}.{" "}
          <span className="text-text-subtle font-normal">— {rx.productName}</span>
        </p>
        <p className="text-[11px] text-text-subtle truncate">
          {rx.quantity} {rx.unit} · {rx.productFormat}
        </p>
      </div>
      <p className="text-[11px] text-text-muted truncate">
        → {rx.dispensary.name}
      </p>
      <Badge tone={rxStatusTone(rx.status)}>{rxStatusLabel(rx.status)}</Badge>
      <p className="text-[11px] text-text-subtle tabular-nums">
        {formatRelative(rx.createdAt)}
      </p>
    </div>
  );
}

interface DispenseRowData {
  id: string;
  productName: string;
  productSku: string;
  quantity: number;
  unit: string;
  totalCents: number;
  budtenderName: string;
  dispensedAt: Date;
  patient: { firstName: string; lastName: string };
  dispensary: { name: string };
}

function DispenseRow({ dispense }: { dispense: DispenseRowData }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_120px_120px] items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface-muted">
      <div className="min-w-0">
        <p className="text-sm text-text font-medium truncate">
          {dispense.patient.lastName}, {dispense.patient.firstName.charAt(0)}.{" "}
          <span className="text-text-subtle font-normal">
            — {dispense.productName}
          </span>
        </p>
        <p className="text-[11px] text-text-subtle truncate">
          {dispense.quantity} {dispense.unit} · SKU {dispense.productSku} · BT{" "}
          {dispense.budtenderName}
        </p>
      </div>
      <p className="text-[11px] text-text-muted truncate">
        {dispense.dispensary.name}
      </p>
      <p className="text-sm text-text tabular-nums">
        {formatMoney(dispense.totalCents)}
      </p>
      <p className="text-[11px] text-text-subtle tabular-nums">
        {formatRelative(dispense.dispensedAt)}
      </p>
    </div>
  );
}

function rxStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "sent_to_dispensary":
      return "Sent";
    case "approved_by_dispensary":
      return "Approved";
    case "rejected_by_dispensary":
      return "Rejected";
    case "partially_dispensed":
      return "Partial fill";
    case "fully_dispensed":
      return "Fully filled";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

function rxStatusTone(
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
    case "draft":
      return "neutral";
    case "sent_to_dispensary":
      return "warning";
    case "approved_by_dispensary":
    case "partially_dispensed":
      return "info";
    case "fully_dispensed":
      return "success";
    case "rejected_by_dispensary":
    case "cancelled":
    case "expired":
      return "danger";
    default:
      return "neutral";
  }
}
