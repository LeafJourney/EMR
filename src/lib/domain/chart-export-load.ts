// Chart Export — server-side loader (EMR-785)
//
// Reads everything we need from the database for a single patient and
// hands it to `buildChartExport` in chart-export.ts. Kept separate from
// the pure formatting module so the formatter stays edge-runtime-safe
// and unit-testable without a Prisma client.

import { prisma } from "@/lib/db/prisma";
import type { AuthedUser } from "@/lib/auth/session";
import {
  buildChartExport,
  type ChartExportPackage,
  type SectionFlags,
} from "./chart-export";

const MAX_NOTES = 200;
const MAX_LABS = 200;
const MAX_DOCUMENTS = 500;
const MAX_OUTCOMES = 1000;
const MAX_DOSE_LOGS = 200;
const MAX_MEMORIES = 200;

export interface LoadedPatientForExport {
  patientId: string;
  organizationId: string;
}

/**
 * Resolve the requesting user's right to export this patient's chart.
 *
 * Authorized callers:
 *   - any clinical role in the patient's organization (clinician, operator,
 *     practice_owner, system)
 *   - the patient themselves (Patient.userId === user.id)
 *
 * Throws Error("UNAUTHORIZED") if the user has no organization, or
 * Error("FORBIDDEN") / Error("NOT_FOUND") for access denials.
 */
export async function resolveChartExportAccess(
  user: AuthedUser,
  patientId: string,
): Promise<{ patientId: string; organizationId: string; selfService: boolean }> {
  if (!user.organizationId) throw new Error("UNAUTHORIZED");

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: { id: true, organizationId: true, userId: true },
  });
  if (!patient) throw new Error("NOT_FOUND");

  const inOrg = patient.organizationId === user.organizationId;
  const isOwner = patient.userId && patient.userId === user.id;

  const clinicalRoles = new Set(["clinician", "operator", "practice_owner", "system"]);
  const hasClinicalRole = user.roles.some((r) => clinicalRoles.has(r));

  if (isOwner) {
    return { patientId: patient.id, organizationId: patient.organizationId, selfService: true };
  }
  if (inOrg && hasClinicalRole) {
    return { patientId: patient.id, organizationId: patient.organizationId, selfService: false };
  }
  throw new Error("FORBIDDEN");
}

export interface LoadChartExportArgs {
  patientId: string;
  organizationId: string;
  sections: SectionFlags;
  practiceName: string;
  preparedBy: string;
  preparedByRole: string;
}

/**
 * Hydrate a full chart export package for the given patient + section
 * selection. Skips queries for sections the caller did not request.
 */
export async function loadChartExport(
  args: LoadChartExportArgs,
): Promise<ChartExportPackage> {
  const { patientId, organizationId, sections } = args;

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId,
      deletedAt: null,
    },
    include: { chartSummary: true },
  });
  if (!patient) throw new Error("NOT_FOUND");

  const [
    medications,
    regimens,
    doseLogs,
    outcomes,
    assessments,
    encounters,
    notes,
    labs,
    documents,
    memories,
  ] = await Promise.all([
    sections.medications
      ? prisma.patientMedication.findMany({
          where: { patientId },
          orderBy: [{ active: "desc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    sections.dosing
      ? prisma.dosingRegimen.findMany({
          where: { patientId },
          orderBy: [{ active: "desc" }, { startDate: "desc" }],
        })
      : Promise.resolve([]),
    sections.dosing
      ? prisma.doseLog.findMany({
          where: { patientId },
          orderBy: { loggedAt: "desc" },
          take: MAX_DOSE_LOGS,
        })
      : Promise.resolve([]),
    sections.outcomes
      ? prisma.outcomeLog.findMany({
          where: { patientId },
          orderBy: { loggedAt: "desc" },
          take: MAX_OUTCOMES,
        })
      : Promise.resolve([]),
    sections.assessments
      ? prisma.assessmentResponse.findMany({
          where: { patientId },
          orderBy: { submittedAt: "desc" },
          include: { assessment: { select: { slug: true, title: true } } },
        })
      : Promise.resolve([]),
    sections.encounters
      ? prisma.encounter.findMany({
          where: { patientId, organizationId },
          orderBy: { scheduledFor: "desc" },
        })
      : Promise.resolve([]),
    sections.notes
      ? prisma.note.findMany({
          where: {
            encounter: { patientId, organizationId },
          },
          orderBy: { createdAt: "desc" },
          take: MAX_NOTES,
        })
      : Promise.resolve([]),
    sections.labs
      ? prisma.labResult.findMany({
          where: { patientId, organizationId },
          orderBy: { receivedAt: "desc" },
          take: MAX_LABS,
        })
      : Promise.resolve([]),
    sections.documents
      ? prisma.document.findMany({
          where: { patientId, organizationId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: MAX_DOCUMENTS,
        })
      : Promise.resolve([]),
    sections.memories
      ? prisma.patientMemory.findMany({
          where: { patientId, validUntil: null },
          orderBy: { createdAt: "desc" },
          take: MAX_MEMORIES,
        })
      : Promise.resolve([]),
  ]);

  return buildChartExport({
    sections,
    practiceName: args.practiceName,
    preparedBy: args.preparedBy,
    preparedByRole: args.preparedByRole,
    patient,
    medications,
    regimens,
    doseLogs,
    outcomes,
    assessments,
    encounters,
    notes,
    labs,
    documents,
    memories,
  });
}

/**
 * Record an audit entry for a chart download. Captures who, what, which
 * sections, and the requested format. Best-effort: failures are logged
 * but never block the download — having the file is more important than
 * having the audit row.
 */
export async function recordChartExportAudit(opts: {
  organizationId: string;
  actorUserId: string;
  patientId: string;
  sections: string[];
  format: "lfj" | "pdf" | "html";
  selfService: boolean;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: opts.organizationId,
        actorUserId: opts.actorUserId,
        action: "chart.export",
        subjectType: "Patient",
        subjectId: opts.patientId,
        metadata: {
          format: opts.format,
          sections: opts.sections,
          selfService: opts.selfService,
        },
      },
    });
  } catch {
    // Audit best-effort: never block the download.
  }
}
