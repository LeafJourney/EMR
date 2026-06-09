import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { MetricTile } from "@/components/ui/metric-tile";
import { EXCLUDE_CALENDAR_BLOCK_PATIENT } from "@/lib/domain/calendar-block-patient";
import { PatientsClient } from "./patients-client";

export const metadata = { title: "Patients" };

export default async function OpsPatientsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const user = await requireUser();
  const orgId = user.organizationId!;
  const statusFilter = searchParams.status ?? "all";

  const statusWhere =
    statusFilter !== "all" ? { status: statusFilter as any } : {};

  const [patients, counts] = await Promise.all([
    prisma.patient.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...statusWhere,
        ...EXCLUDE_CALENDAR_BLOCK_PATIENT,
      },
      include: {
        chartSummary: true,
        tasks: { where: { status: "open" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.patient.groupBy({
      by: ["status"],
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...EXCLUDE_CALENDAR_BLOCK_PATIENT,
      },
      _count: true,
    }),
  ]);

  const countByStatus = Object.fromEntries(
    counts.map((c) => [c.status, c._count])
  );
  const totalCount = Object.values(countByStatus).reduce(
    (a, b) => a + b,
    0
  );

  const serializedPatients = patients.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    status: p.status,
    email: p.email,
    phone: p.phone,
    chartReadiness: p.chartSummary?.completenessScore ?? null,
    missingFields: p.chartSummary?.missingFields ?? [],
    openTaskCount: p.tasks.length,
    updatedAt: p.updatedAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    intakeProgress: estimateIntakeProgress(p),
    // EMR-955 — serialize DOB for the compact age label (no Date over the wire).
    dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString() : null,
  }));

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Patients"
        title="Intake funnel"
        description="Every patient in the system, sorted by most recent activity."
      />

      {/* ---- Summary tiles ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricTile label="Total" value={totalCount} />
        <MetricTile
          label="Prospects"
          value={countByStatus.prospect ?? 0}
          accent="amber"
        />
        <MetricTile
          label="Active"
          value={countByStatus.active ?? 0}
          accent="forest"
        />
        <MetricTile
          label="Inactive"
          value={(countByStatus.inactive ?? 0) + (countByStatus.archived ?? 0)}
        />
      </div>

      <PatientsClient
        patients={serializedPatients}
        activeFilter={statusFilter}
      />
    </PageShell>
  );
}

function estimateIntakeProgress(patient: {
  intakeAnswers: unknown;
  chartSummary: { completenessScore: number } | null;
}): number {
  if (patient.chartSummary?.completenessScore) {
    return patient.chartSummary.completenessScore;
  }
  const answers = patient.intakeAnswers as Record<string, unknown> | null;
  if (!answers) return 0;
  const count = Object.keys(answers).length;
  return Math.min(count * 10, 100);
}
