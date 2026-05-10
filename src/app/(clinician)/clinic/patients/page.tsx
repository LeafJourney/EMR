import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { PatientListClient } from "./patient-list-client";
import Link from "next/link";
import { logger } from "@/lib/observability/log";

export const metadata = { title: "Patient Roster" };

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const user = await requireUser();
  const orgId = user.organizationId!;

  // Fetch all non-deleted patients with chart summary
  // EMR-debt: hard cap. A single render of the roster ships every row to
  // the client; a 500+ patient org needs server-side pagination, not a page
  // dump. 500 is a defensive ceiling — most orgs are well under it. When a
  // practice grows past this we fail loud (the count below) and add proper
  // pagination + filter UI.
  const PATIENT_ROSTER_CAP = 500;
  const patients = await prisma.patient.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: { chartSummary: true },
    orderBy: { lastName: "asc" },
    take: PATIENT_ROSTER_CAP,
  });
  if (patients.length === PATIENT_ROSTER_CAP) {
    logger.warn({
      event: "clinic.patients_roster.cap_hit",
      cap: PATIENT_ROSTER_CAP,
      orgId,
      message:
        "Add server-side pagination before this org grows further.",
    });
  }

  // Fetch pain outcome logs (last 7 per patient) for sparklines
  const patientIds = patients.map((p) => p.id);
  // 7 sparkline points per patient × up to 500 patients = 3500. Anything
  // older isn't rendered anyway, so capping the read avoids dragging years
  // of pain logs into memory just to throw most of them away.
  const outcomeLogs = patientIds.length
    ? await prisma.outcomeLog.findMany({
        where: {
          patientId: { in: patientIds },
          metric: "pain",
        },
        orderBy: { loggedAt: "desc" },
        select: {
          patientId: true,
          value: true,
          loggedAt: true,
        },
        take: 7 * PATIENT_ROSTER_CAP,
      })
    : [];

  // Group pain logs per patient, keep only last 7
  const painByPatient = new Map<string, number[]>();
  for (const log of outcomeLogs) {
    const existing = painByPatient.get(log.patientId) ?? [];
    if (existing.length < 7) {
      existing.push(log.value);
    }
    painByPatient.set(log.patientId, existing);
  }

  // Fetch last encounter (completed) per patient for "last visit" date
  // We only consume the FIRST completed encounter per patient (line 67
  // breaks once each patient is mapped). Capping the read keeps a patient
  // with 10 years of completed visits from dragging thousands of rows into
  // a render that uses one date per patient.
  const lastEncounters = patientIds.length
    ? await prisma.encounter.findMany({
        where: {
          patientId: { in: patientIds },
          status: "complete",
        },
        orderBy: { completedAt: "desc" },
        select: {
          patientId: true,
          completedAt: true,
        },
        take: PATIENT_ROSTER_CAP * 5,
      })
    : [];

  const lastVisitByPatient = new Map<string, string>();
  for (const enc of lastEncounters) {
    if (!lastVisitByPatient.has(enc.patientId) && enc.completedAt) {
      lastVisitByPatient.set(enc.patientId, enc.completedAt.toISOString());
    }
  }

  // Compute status counts
  const statusCounts = {
    all: patients.length,
    active: patients.filter((p) => p.status === "active").length,
    prospect: patients.filter((p) => p.status === "prospect").length,
    inactive: patients.filter((p) => p.status === "inactive").length,
  };

  // Compute avg chart readiness
  const withScores = patients.filter((p) => p.chartSummary?.completenessScore != null);
  const avgReadiness =
    withScores.length > 0
      ? Math.round(
          withScores.reduce((sum, p) => sum + (p.chartSummary?.completenessScore ?? 0), 0) /
            withScores.length
        )
      : 0;

  // Serialize for client
  const serialized = patients.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    status: p.status as string,
    presentingConcerns: p.presentingConcerns,
    completenessScore: p.chartSummary?.completenessScore ?? null,
    updatedAt: p.updatedAt.toISOString(),
    lastVisit: lastVisitByPatient.get(p.id) ?? null,
    painTrend: painByPatient.get(p.id)?.reverse() ?? [], // chronological order
  }));

  const activeStatus = searchParams.status ?? "all";

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Patients"
        title="Patient roster"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-muted tabular-nums">
              {patients.length} patient{patients.length === 1 ? "" : "s"}
            </span>
            <Link href="/sign-up">
              <Button variant="secondary" size="sm">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  className="opacity-60"
                  aria-hidden="true"
                >
                  <path
                    d="M7 1.5v11M1.5 7h11"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                New patient
              </Button>
            </Link>
          </div>
        }
      />
      <PatientListClient
        patients={serialized}
        statusCounts={statusCounts}
        avgReadiness={avgReadiness}
        initialStatus={activeStatus}
      />
    </PageShell>
  );
}
