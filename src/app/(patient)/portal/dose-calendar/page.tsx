import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { CalendarView } from "./calendar-view";
import type { DoseLogLite } from "@/lib/domain/dose-calendar";

export const metadata = { title: "Dose Calendar" };

export default async function DoseCalendarPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  let logs: DoseLogLite[] = [];
  let scheduledPerDay = 0;
  let regimenName = "Your doses";

  if (patient) {
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);
    const [doseRows, regimens] = await Promise.all([
      prisma.doseLog.findMany({
        where: { patientId: patient.id, loggedAt: { gte: since } },
        select: { loggedAt: true, actualVolume: true, volumeUnit: true },
        orderBy: { loggedAt: "desc" },
      }),
      prisma.dosingRegimen.findMany({
        where: { patientId: patient.id, active: true },
        select: { frequencyPerDay: true, product: { select: { name: true } } },
      }),
    ]);
    logs = doseRows.map((d) => ({
      loggedAt: d.loggedAt.toISOString(),
      actualVolume: d.actualVolume,
      volumeUnit: d.volumeUnit,
    }));
    scheduledPerDay = regimens.reduce((sum, r) => sum + r.frequencyPerDay, 0);
    if (regimens.length === 1 && regimens[0].product?.name) {
      regimenName = regimens[0].product.name;
    } else if (regimens.length > 1) {
      regimenName = `${regimens.length} active regimens`;
    }
  }

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PatientSectionNav section="health" />
      <div className="mb-10 text-center">
        <Eyebrow className="justify-center mb-3">Dose tracking</Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight">
          Dose calendar
        </h1>
        <p className="text-sm text-text-muted mt-3 max-w-md mx-auto leading-relaxed">
          {scheduledPerDay > 0
            ? "Each day shows the doses you logged against your schedule."
            : "Each day shows the doses you logged."}
        </p>
      </div>

      <CalendarView
        logs={logs}
        scheduledPerDay={scheduledPerDay}
        regimenName={regimenName}
      />
    </PageShell>
  );
}
