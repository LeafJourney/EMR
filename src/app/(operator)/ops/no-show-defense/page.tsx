import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { computeAppointmentRisk } from "@/lib/scheduling/appointment-risk";
import { tierPlaybook } from "@/lib/scheduling/no-show-model";
import { NoShowCockpit, type RiskedVisit } from "./cockpit-client";

export const metadata = { title: "No-show defense" };

/**
 * No-show Defense Cockpit.
 *
 * Capstone surface that connects the scheduling engines into one front-desk
 * workflow: every upcoming (requested/confirmed) visit in the next 14 days is
 * risk-scored (EMR-207 no-show model), the tier playbook turns the score into a
 * recommended action, and the cockpit lets the operator preview the reminder
 * plan (EMR-211) and deep-link to the waitlist (EMR-210). Low-risk visits are
 * filtered out so the board only shows what's worth defending.
 */
export default async function NoShowDefensePage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + 14);

  const appts = await prisma.appointment.findMany({
    where: {
      patient: { organizationId },
      startAt: { gte: now, lt: horizonEnd },
      status: { in: ["requested", "confirmed"] },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
    orderBy: { startAt: "asc" },
  });

  // Prior visit history per patient → no-show features (one extra query).
  const patientIds = Array.from(new Set(appts.map((a) => a.patientId)));
  const priorRows = patientIds.length
    ? await prisma.appointment.findMany({
        where: { patientId: { in: patientIds } },
        select: { patientId: true, status: true, startAt: true },
      })
    : [];
  const priorsByPatient = new Map<string, { status: string; startAt: Date }[]>();
  for (const r of priorRows) {
    const list = priorsByPatient.get(r.patientId) ?? [];
    list.push({ status: r.status, startAt: r.startAt });
    priorsByPatient.set(r.patientId, list);
  }

  const visits: RiskedVisit[] = appts
    .map((a) => {
      const prediction = computeAppointmentRisk({
        startAt: a.startAt,
        bookedAt: a.createdAt,
        modality: a.modality,
        priorVisits: priorsByPatient.get(a.patientId) ?? [],
      });
      return { a, prediction };
    })
    // Only medium/high are worth defending; low risk stays off the board.
    .filter(({ prediction }) => prediction.tier !== "low")
    .sort((x, y) => y.prediction.probability - x.prediction.probability)
    .map(({ a, prediction }) => ({
      id: a.id,
      patient: {
        id: a.patient.id,
        firstName: a.patient.firstName,
        lastName: a.patient.lastName,
      },
      providerName: a.provider
        ? `${a.provider.user.firstName} ${a.provider.user.lastName}`.trim()
        : null,
      startAt: a.startAt.toISOString(),
      modality: a.modality,
      status: a.status,
      tier: prediction.tier as "medium" | "high",
      probability: prediction.probability,
      topFactors: prediction.topFactors,
      playbook: tierPlaybook(prediction.tier),
    }));

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Practice management"
        title="No-show defense"
        description="Upcoming visits ranked by no-show risk, with the recommended action for each."
      />
      <NoShowCockpit visits={visits} />
    </PageShell>
  );
}
