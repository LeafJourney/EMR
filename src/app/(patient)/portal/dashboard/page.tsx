// EMR-186 — Patient Modular Dashboard.
//
// Drag-and-drop widget grid the patient can rearrange to put what
// matters most on top. Layout persists to localStorage so it follows
// the user across sessions on the same device. Server-rendered shell
// loads patient data (visits, regimens, recent outcomes); the client
// component handles ordering + drag interactions.

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { ModularDashboard } from "@/components/patient/ModularDashboard";
import { PrevisitReadinessBanner } from "../previsit-readiness-banner";

export const metadata = { title: "Dashboard" };

export default async function PatientDashboardPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      firstName: true,
      outcomeLogs: {
        orderBy: { loggedAt: "desc" },
        take: 60,
        select: { metric: true, value: true, loggedAt: true },
      },
      encounters: {
        orderBy: { scheduledFor: "desc" },
        take: 5,
        select: {
          id: true,
          scheduledFor: true,
          status: true,
          modality: true,
        },
      },
      dosingRegimens: {
        where: { active: true },
        select: {
          id: true,
          calculatedThcMgPerDay: true,
          calculatedCbdMgPerDay: true,
          calculatedThcMgPerDose: true,
          calculatedCbdMgPerDose: true,
          frequencyPerDay: true,
        },
      },
      labResults: {
        orderBy: { receivedAt: "desc" },
        take: 6,
        select: {
          id: true,
          panelName: true,
          abnormalFlag: true,
          receivedAt: true,
        },
      },
    },
  });

  if (!patient) redirect("/portal/intake");

  // Reduce outcome logs to per-metric series (oldest -> newest) so the
  // client can render sparklines without re-aggregating.
  const series: Record<string, number[]> = {};
  const latest: Record<string, number> = {};
  for (const log of [...patient.outcomeLogs].reverse()) {
    if (!series[log.metric]) series[log.metric] = [];
    series[log.metric].push(log.value);
    latest[log.metric] = log.value;
  }

  const totalThc = patient.dosingRegimens.reduce(
    (acc, r) =>
      acc +
      (r.calculatedThcMgPerDay ??
        (r.calculatedThcMgPerDose ?? 0) * r.frequencyPerDay),
    0,
  );
  const totalCbd = patient.dosingRegimens.reduce(
    (acc, r) =>
      acc +
      (r.calculatedCbdMgPerDay ??
        (r.calculatedCbdMgPerDose ?? 0) * r.frequencyPerDay),
    0,
  );

  const nextVisit = patient.encounters.find((e) => e.status === "scheduled");

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <div className="mb-7">
        <Eyebrow className="mb-2">Modular dashboard</Eyebrow>
        <h1 className="font-display text-2xl md:text-3xl text-text tracking-tight">
          {patient.firstName}&apos;s dashboard
        </h1>
        <p className="text-sm text-text-muted mt-2 max-w-xl leading-relaxed">
          Drag widgets to rearrange. Your layout is saved to this device.
        </p>
      </div>

      <PrevisitReadinessBanner patientId={patient.id} />

      <ModularDashboard
        data={{
          firstName: patient.firstName,
          latest,
          series,
          nextVisit: nextVisit
            ? {
                id: nextVisit.id,
                scheduledFor: nextVisit.scheduledFor
                  ? nextVisit.scheduledFor.toISOString()
                  : null,
                modality: nextVisit.modality,
              }
            : null,
          regimenCount: patient.dosingRegimens.length,
          totalThc,
          totalCbd,
          labs: patient.labResults.map((l) => ({
            id: l.id,
            name: l.panelName,
            abnormal: l.abnormalFlag,
            receivedAt: l.receivedAt.toISOString(),
          })),
        }}
      />
    </PageShell>
  );
}
