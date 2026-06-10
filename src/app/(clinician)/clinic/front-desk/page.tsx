import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { ensureTodayEncounters } from "@/lib/domain/ensure-encounter";
import { PageShell } from "@/components/shell/PageHeader";
import { FrontDeskList, type FrontDeskRow } from "./front-desk-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Front Desk" };

// EMR-1108 (FO-1) + EMR-1112 (FO-5) — the clinic-side check-in surface.
// The queue transition actions (moveQueueEncounter) always allowed
// front_office, but the only UI was /ops/queue behind the operator layout,
// so the desk had no button to check a walk-in in. This page lists today's
// visits inside the clinic shell with one-click state advances, plus the
// FO-5 balance/copay chip so Robin knows what to collect without
// chart-diving.

// Mirror of QUEUE_STATE_ROLES in (operator)/ops/queue/actions.ts — the page
// gate must match the action gate so nobody sees buttons they can't press.
const QUEUE_STATE_ROLES = new Set<string>([
  "front_office",
  "back_office",
  "operator",
  "practice_owner",
  "practice_admin",
  "system",
]);

export default async function FrontDeskPage() {
  const user = await requireUser();
  if (!user.roles.some((r) => QUEUE_STATE_ROLES.has(r))) {
    redirect("/clinic");
  }
  const orgId = user.organizationId;
  if (!orgId) redirect("/clinic");

  // Day-of backstop (same as /ops/queue): materialize encounters for today's
  // confirmed appointments so every booked patient is check-in-able.
  await ensureTodayEncounters(orgId);

  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const encounters = await prisma.encounter.findMany({
    where: {
      organizationId: orgId,
      OR: [
        { scheduledFor: { gte: startOfDay, lt: endOfDay } },
        { startedAt: { gte: startOfDay, lt: endOfDay } },
        { completedAt: { gte: startOfDay, lt: endOfDay } },
      ],
    },
    select: {
      id: true,
      status: true,
      scheduledFor: true,
      createdAt: true,
      modality: true,
      reason: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: {
        select: { user: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { scheduledFor: "asc" },
  });

  // ── FO-5: balance/copay at the check-in surface ─────────────────────────
  // Same derivation as the financial cockpit (lib/domain/billing.ts
  // getPatientFinancialSummary), batched across today's roster instead of
  // one summary call per patient:
  //   balance = max(0, Σ claim.patientRespCents − Σ patient-source payments)
  //   copay owed = max(0, Σ copay_assessed − Σ copay_collected)
  const patientIds = Array.from(new Set(encounters.map((e) => e.patient.id)));
  const [claims, copayEvents] = patientIds.length
    ? await Promise.all([
        prisma.claim.findMany({
          where: { patientId: { in: patientIds } },
          select: {
            patientId: true,
            patientRespCents: true,
            payments: { select: { source: true, amountCents: true } },
          },
        }),
        prisma.financialEvent.findMany({
          where: {
            patientId: { in: patientIds },
            type: { in: ["copay_assessed", "copay_collected"] },
          },
          select: { patientId: true, type: true, amountCents: true },
        }),
      ])
    : [[], []];

  const balanceByPatient = new Map<string, { respCents: number; paidCents: number }>();
  for (const claim of claims) {
    const entry = balanceByPatient.get(claim.patientId) ?? {
      respCents: 0,
      paidCents: 0,
    };
    entry.respCents += claim.patientRespCents;
    entry.paidCents += claim.payments
      .filter((p) => p.source === "patient")
      .reduce((sum, p) => sum + p.amountCents, 0);
    balanceByPatient.set(claim.patientId, entry);
  }

  const copayByPatient = new Map<string, { assessed: number; collected: number }>();
  for (const event of copayEvents) {
    const entry = copayByPatient.get(event.patientId) ?? {
      assessed: 0,
      collected: 0,
    };
    if (event.type === "copay_assessed") entry.assessed += event.amountCents;
    else entry.collected += event.amountCents;
    copayByPatient.set(event.patientId, entry);
  }

  const rows: FrontDeskRow[] = encounters.map((enc) => {
    const balance = balanceByPatient.get(enc.patient.id);
    const copay = copayByPatient.get(enc.patient.id);
    return {
      encounterId: enc.id,
      patientId: enc.patient.id,
      patientName: `${enc.patient.firstName} ${enc.patient.lastName}`.trim(),
      scheduledFor: (enc.scheduledFor ?? enc.createdAt).toISOString(),
      visitStatus: enc.status,
      provider: enc.provider?.user
        ? `${enc.provider.user.firstName} ${enc.provider.user.lastName}`.trim()
        : null,
      modality: enc.modality ?? "in_person",
      reason: enc.reason,
      balanceCents: balance
        ? Math.max(0, balance.respCents - balance.paidCents)
        : 0,
      copayOwedCents: copay
        ? Math.max(0, copay.assessed - copay.collected)
        : 0,
    };
  });

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <FrontDeskList rows={rows} loadedAt={new Date().toISOString()} />
    </PageShell>
  );
}
