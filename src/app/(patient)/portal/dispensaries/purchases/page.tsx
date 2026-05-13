// EMR-091 — Patient view of cannabis dispensary purchase history.
//
// Lists every DispensaryDispense for this patient with the budtender
// who handed off the product, what was purchased, when, and whether
// the dispense has been forwarded to the state medical cannabis
// registry. The patient sees their MMJ card status at the top so
// they're never surprised when an expired card blocks a checkout.

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatRelative } from "@/lib/utils/format";
import { formatMoney } from "@/lib/domain/billing";
import { checkCardEligibility } from "@/lib/dispensary/medical-cannabis";

export const metadata = { title: "Dispensary purchases" };

export default async function PatientDispensaryPurchasesPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) redirect("/portal/intake");

  const [card, dispenses] = await Promise.all([
    prisma.medicalCannabisCard.findFirst({
      where: { patientId: patient.id, status: { not: "revoked" } },
      orderBy: { expiresOn: "desc" },
    }),
    prisma.dispensaryDispense.findMany({
      where: { patientId: patient.id },
      orderBy: { dispensedAt: "desc" },
      take: 30,
      include: {
        dispensary: { select: { name: true, city: true, state: true } },
      },
    }),
  ]);

  const cardCheck = card
    ? checkCardEligibility({
        status: card.status as never,
        expiresOn: card.expiresOn,
      })
    : null;

  return (
    <PageShell maxWidth="max-w-[920px]">
      <PageHeader
        eyebrow="Dispensary"
        title="Your purchases"
        description="Everything you've purchased from a dispensary through your provider's electronic prescription, with the budtender signature and state-registry status."
      />

      <PatientSectionNav section="health" />

      <Card tone="ambient" className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Medical cannabis card</CardTitle>
          <CardDescription>
            Medical-only — recreational purchases don't flow through your chart.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!card ? (
            <p className="text-sm text-text-muted">
              We don't have a medical cannabis card on file. Bring your card to
              your next visit so we can verify and link it.
            </p>
          ) : cardCheck?.eligible ? (
            <div className="text-sm">
              <p className="text-text">
                Card #{card.cardNumber} · {card.issuingState}
              </p>
              <p className="text-text-subtle text-xs mt-1">
                Expires {formatDate(card.expiresOn)}{" "}
                <Badge tone="success" className="ml-2">
                  Active
                </Badge>
              </p>
            </div>
          ) : (
            <div className="text-sm">
              <p className="text-text">Card #{card.cardNumber}</p>
              <p className="text-danger text-xs mt-1">
                {cardCheck?.eligible === false ? cardCheck.reason : "Card unavailable"}
              </p>
              <p className="text-xs text-text-muted mt-2">
                Without an active card, dispensaries won't be able to fulfil a
                cannabis prescription. Reach out to your provider to renew.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Purchase history</CardTitle>
          <CardDescription>
            Each row is a real dispense — budtender e-signature, SKU, and
            cannabinoid breakdown are kept for your records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dispenses.length === 0 ? (
            <EmptyState
              title="No purchases yet"
              description="When a dispensary fulfils your provider's cannabis prescription, the dispense will appear here automatically."
            />
          ) : (
            dispenses.map((d) => (
              <div
                key={d.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <p className="text-sm text-text font-medium">
                      {d.productName}
                    </p>
                    <p className="text-[11px] text-text-subtle">
                      SKU {d.productSku} · {d.quantity} {d.unit}
                    </p>
                  </div>
                  <p className="text-sm text-text tabular-nums">
                    {formatMoney(d.totalCents)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px] text-text-muted">
                  <p>
                    {d.dispensary.name}
                    {d.dispensary.city ? ` · ${d.dispensary.city}, ${d.dispensary.state}` : ""}
                  </p>
                  <p className="text-right">
                    {formatDate(d.dispensedAt)} · {formatRelative(d.dispensedAt)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px] text-text-subtle mt-1">
                  <p>Budtender: {d.budtenderName}</p>
                  <p className="text-right">
                    {d.stateRegistryForwardedAt ? (
                      <Badge tone="success">Reported to registry</Badge>
                    ) : (
                      <Badge tone="neutral">Pending registry sync</Badge>
                    )}
                  </p>
                </div>
                {(d.thcMgPerUnit != null || d.cbdMgPerUnit != null) && (
                  <p className="text-[11px] text-text-subtle mt-2">
                    {d.thcMgPerUnit != null
                      ? `THC ${d.thcMgPerUnit}mg/unit`
                      : ""}
                    {d.thcMgPerUnit != null && d.cbdMgPerUnit != null ? " · " : ""}
                    {d.cbdMgPerUnit != null ? `CBD ${d.cbdMgPerUnit}mg/unit` : ""}
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="mt-6">
        <Link href="/portal/dispensaries">
          <Button variant="ghost" size="sm">
            ← Find a dispensary
          </Button>
        </Link>
      </div>
    </PageShell>
  );
}
