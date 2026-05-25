import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { QueueBoard } from "./queue-board";
import {
  calculateWaitTime,
  type QueueEntry,
  type QueueStatus,
} from "@/lib/domain/queue-board";

export const metadata = { title: "Today's Queue" };

/**
 * Front-desk Queue Board — server component.
 *
 * Loads today's encounters whose status is still in motion (scheduled or
 * in_progress) plus today's completed visits, so the board can show the
 * full day of flow on a single screen. The client component handles the
 * 30-second auto-refresh via setInterval against this page.
 */
export default async function QueueBoardPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  // Pull every encounter scheduled today, regardless of status. The kanban
  // mirrors the patient's full day-trip through the clinic.
  const encounters = await prisma.encounter.findMany({
    where: {
      organizationId: orgId,
      OR: [
        { scheduledFor: { gte: startOfDay, lt: endOfDay } },
        { startedAt: { gte: startOfDay, lt: endOfDay } },
        { completedAt: { gte: startOfDay, lt: endOfDay } },
      ],
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: {
        select: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
  });

  // Map raw encounter rows into the QueueEntry shape the client expects.
  // EncounterStatus is a 3-value enum (scheduled | in_progress | complete).
  // We surface those into the broader QueueStatus vocabulary so the kanban
  // has somewhere to put each card today; the empty intermediate columns
  // (arrived / rooming / checkout) stand ready for future state hooks.
  const entries: QueueEntry[] = encounters.map((enc) => {
    const queueStatus: QueueStatus =
      enc.status === "complete"
        ? "completed"
        : enc.status === "in_progress"
          ? "in_visit"
          : "scheduled";

    const scheduledIso =
      enc.scheduledFor?.toISOString() ?? enc.createdAt.toISOString();

    const providerName = enc.provider?.user
      ? `${enc.provider.user.firstName} ${enc.provider.user.lastName}`
      : undefined;

    const minutesWaiting = calculateWaitTime(scheduledIso, queueStatus) ?? undefined;

    return {
      encounterId: enc.id,
      patientId: enc.patient.id,
      patientName: `${enc.patient.firstName} ${enc.patient.lastName}`,
      scheduledFor: scheduledIso,
      status: queueStatus,
      provider: providerName,
      modality: (enc.modality as QueueEntry["modality"]) ?? "in_person",
      reason: enc.reason ?? undefined,
      minutesWaiting,
    };
  });

  return (
    <PageShell maxWidth="max-w-[1480px]">
      <QueueBoard entries={entries} loadedAt={new Date().toISOString()} />
    </PageShell>
  );
}
