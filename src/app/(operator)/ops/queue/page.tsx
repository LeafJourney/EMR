import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { ensureTodayEncounters } from "@/lib/domain/ensure-encounter";
import { PageShell } from "@/components/shell/PageHeader";
import { QueueBoard } from "./queue-board";
import {
  calculateWaitTime,
  mapEncounterStatusToQueueStatus,
  type QueueEntry,
} from "@/lib/domain/queue-board";

export const metadata = { title: "Today's Queue" };

type RoomingContext = {
  room?: string;
  readinessFlags?: string[];
  handoffNote?: string;
};

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

  // Day-of backstop: make sure every confirmed appointment for today has its
  // Encounter materialized so booked patients appear on the board (as
  // "Scheduled") and are checkinable, even if they were confirmed before the
  // encounter bridge existed. Idempotent and bounded to today's org.
  await ensureTodayEncounters(orgId);

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
    select: {
      id: true,
      status: true,
      scheduledFor: true,
      createdAt: true,
      modality: true,
      reason: true,
      briefingContext: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: {
        select: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
  });

  const entries: QueueEntry[] = encounters.map((enc) => {
    const queueStatus = mapEncounterStatusToQueueStatus(enc.status);

    const scheduledIso =
      enc.scheduledFor?.toISOString() ?? enc.createdAt.toISOString();

    const providerName = enc.provider?.user
      ? `${enc.provider.user.firstName} ${enc.provider.user.lastName}`
      : undefined;

    const minutesWaiting = calculateWaitTime(scheduledIso, queueStatus) ?? undefined;
    const rooming = readRoomingContext(enc.briefingContext);

    return {
      encounterId: enc.id,
      patientId: enc.patient.id,
      patientName: `${enc.patient.firstName} ${enc.patient.lastName}`,
      scheduledFor: scheduledIso,
      status: queueStatus,
      visitStatus: enc.status,
      provider: providerName,
      modality: (enc.modality as QueueEntry["modality"]) ?? "in_person",
      reason: enc.reason ?? undefined,
      minutesWaiting,
      room: rooming?.room,
      readinessFlags: rooming?.readinessFlags,
      handoffNote: rooming?.handoffNote,
    };
  });

  return (
    <PageShell maxWidth="max-w-[1480px]">
      <QueueBoard entries={entries} loadedAt={new Date().toISOString()} />
    </PageShell>
  );
}

function readRoomingContext(value: unknown): RoomingContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rooming = (value as { rooming?: unknown }).rooming;
  if (!rooming || typeof rooming !== "object" || Array.isArray(rooming)) {
    return undefined;
  }

  const raw = rooming as RoomingContext;
  return {
    room: typeof raw.room === "string" ? raw.room : undefined,
    readinessFlags: Array.isArray(raw.readinessFlags)
      ? raw.readinessFlags.filter((flag): flag is string => typeof flag === "string")
      : undefined,
    handoffNote: typeof raw.handoffNote === "string" ? raw.handoffNote : undefined,
  };
}
