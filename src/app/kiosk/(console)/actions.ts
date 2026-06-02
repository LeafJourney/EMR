"use server";

import type { Prisma } from "@prisma/client";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { patientMatchesQuery } from "@/lib/search/patient-search";
import { computeQueueTransition } from "@/lib/domain/visit-state";
import { logger } from "@/lib/observability/log";
import { appOrigin, issueHandoffToken } from "@/lib/check-in/kiosk-handoff";

/** Constant-time string equality; rejects empty / length-mismatched inputs. */
function timingSafeStrEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Server actions for the front-desk check-in kiosk.
//
// SECURITY MODEL — read before touching:
//   - Every action begins with `requireRole("kiosk")`, so only a kiosk login
//     can call them, and the org scope is taken from the kiosk's OWN session
//     (`user.organizationId`), never from client input. A patientId from the
//     client is always re-verified against that org before use.
//   - The kiosk holds ZERO PHI-read permissions (permissions.ts). These
//     actions return only the minimum a walk-in needs to recognise themselves
//     and check in: name, date of birth, appointment time, and the provider's
//     (clinician, not patient) name. No chart, diagnoses, meds, contact info,
//     or address ever crosses the wire.

/** A patient query must be at least this many characters before we search. */
const MIN_QUERY_LENGTH = 3;
/** Bound the result list so the kiosk never becomes a patient-roster browser. */
const MAX_RESULTS = 8;
/** Upper bound on the candidate set we pull into memory to match against. */
const CANDIDATE_LIMIT = 1000;

export interface KioskPatientHit {
  id: string;
  firstName: string;
  lastNameInitial: string;
}

/**
 * Look up patients in the kiosk's clinic by a self-typed name (or DOB / phone,
 * via the shared matcher). Returns a minimal, PHI-light shape.
 */
export async function kioskSearchPatients(query: string): Promise<KioskPatientHit[]> {
  const user = await requireRole("kiosk");
  const orgId = user.organizationId;
  const q = query.trim();
  if (!orgId || q.length < MIN_QUERY_LENGTH) return [];

  // Org-scoped, non-deleted patients only. We pull a bounded candidate set and
  // filter with the SAME matcher the clinician search uses, so kiosk and staff
  // search behave identically (name / DOB-variants / digits-only phone).
  const patients = await prisma.patient.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true, phone: true },
    take: CANDIDATE_LIMIT,
  });

  const matched = patients.filter((p) =>
    patientMatchesQuery(
      {
        firstName: p.firstName,
        lastName: p.lastName,
        dob: p.dateOfBirth ? p.dateOfBirth.toISOString() : null,
        phone: p.phone,
      },
      q,
    ),
  );

  return matched.slice(0, MAX_RESULTS).map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastNameInitial: p.lastName.charAt(0).toUpperCase(),
  }));
}

/** Pre-visit statuses the kiosk is allowed to surface / act on. */
const KIOSK_VISIBLE_STATUSES = [
  "scheduled",
  "checked_in",
  "info_incomplete",
  "ready",
  "rooming",
  "roomed",
] as const;

function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * The patient's check-in-able encounter for today, if any. Unlike
 * `selectActiveVisitEncounter` (scheduled/in_progress only), this also surfaces
 * already-checked-in encounters so the kiosk can tell a returning walk-in
 * "you're already checked in" instead of "no appointment".
 */
async function loadTodayEncounter(orgId: string, patientId: string) {
  const { start, end } = dayBounds(new Date());
  return prisma.encounter.findFirst({
    where: {
      organizationId: orgId,
      patientId,
      status: { in: [...KIOSK_VISIBLE_STATUSES] },
      OR: [
        { scheduledFor: { gte: start, lte: end } },
        { createdAt: { gte: start, lte: end } },
      ],
    },
    orderBy: { scheduledFor: "asc" },
    include: {
      provider: { include: { user: { select: { firstName: true, lastName: true } } } },
    },
  });
}

export interface KioskAppointment {
  encounterId: string;
  /** ISO timestamp of the scheduled slot, or null for a walk-in. */
  time: string | null;
  /** Clinician's display name (not PHI), or null. */
  providerName: string | null;
  status: string;
  /** True once the encounter has advanced past `scheduled`. */
  alreadyCheckedIn: boolean;
}

export interface KioskCheckInContext {
  patientId: string;
  firstName: string;
  lastName: string;
  appointment: KioskAppointment | null;
}

function providerDisplayName(
  provider: { user: { firstName: string; lastName: string } | null } | null,
): string | null {
  if (!provider?.user) return null;
  const name = `${provider.user.firstName} ${provider.user.lastName}`.trim();
  return name.length > 0 ? name : null;
}

/**
 * Resolve a selected patient's name + today's appointment for the confirmation
 * screen. Re-verifies the patient is in the kiosk's org. Returns null if the id
 * does not belong to this clinic (so the UI shows a generic "see front desk").
 */
export async function getKioskCheckInContext(
  patientId: string,
): Promise<KioskCheckInContext | null> {
  const user = await requireRole("kiosk");
  const orgId = user.organizationId;
  if (!orgId) return null;

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!patient) return null;

  const enc = await loadTodayEncounter(orgId, patient.id);

  return {
    patientId: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    appointment: enc
      ? {
          encounterId: enc.id,
          time: enc.scheduledFor ? enc.scheduledFor.toISOString() : null,
          providerName: providerDisplayName(enc.provider),
          status: enc.status,
          alreadyCheckedIn: enc.status !== "scheduled",
        }
      : null,
  };
}

export interface KioskVerifyDobResult {
  ok: boolean;
  error?: string;
  context?: KioskCheckInContext;
}

/**
 * Verify a patient's date of birth in constant-time on the kiosk itself.
 * If valid, returns the context containing their full name and appointment
 * details so the confirm step can render safely.
 */
export async function kioskVerifyDob(
  patientId: string,
  dob: string,
): Promise<KioskVerifyDobResult> {
  const user = await requireRole("kiosk");
  const orgId = user.organizationId;
  if (!orgId) return { ok: false, error: "This kiosk isn't linked to a clinic yet." };

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, dateOfBirth: true },
  });
  if (!patient || !patient.dateOfBirth) {
    return { ok: false, error: "We couldn't verify your details. Please see the front desk." };
  }

  const expectedDob = patient.dateOfBirth.toISOString().slice(0, 10);
  if (!timingSafeStrEqual(dob.trim(), expectedDob)) {
    return { ok: false, error: "That date of birth didn't match. Please try again." };
  }

  const enc = await loadTodayEncounter(orgId, patient.id);

  return {
    ok: true,
    context: {
      patientId: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      appointment: enc
        ? {
            encounterId: enc.id,
            time: enc.scheduledFor ? enc.scheduledFor.toISOString() : null,
            providerName: providerDisplayName(enc.provider),
            status: enc.status,
            alreadyCheckedIn: enc.status !== "scheduled",
          }
        : null,
    },
  };
}

export interface KioskCheckInResult {
  ok: boolean;
  error?: string;
  status?: string;
  alreadyCheckedIn?: boolean;
}

/**
 * Check the selected patient in to today's appointment. Idempotent: a patient
 * who is already checked in (or further along the queue) gets a success with
 * `alreadyCheckedIn: true` rather than an error. Writes an audit row attributed
 * to the kiosk account.
 */
export async function kioskCheckIn(patientId: string): Promise<KioskCheckInResult> {
  const user = await requireRole("kiosk");
  const orgId = user.organizationId;
  if (!orgId) return { ok: false, error: "This kiosk isn't linked to a clinic yet." };

  // Never trust the client's patientId — re-scope it to the kiosk's org.
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) {
    return { ok: false, error: "We couldn't find your record. Please see the front desk." };
  }

  const enc = await loadTodayEncounter(orgId, patient.id);
  if (!enc) {
    return { ok: false, error: "No appointment found for today. Please see the front desk." };
  }

  // Already checked in (or beyond) — idempotent success, no second write.
  if (enc.status !== "scheduled") {
    return { ok: true, status: enc.status, alreadyCheckedIn: true };
  }

  const next = computeQueueTransition(enc, "checked_in");
  if (!next.ok) {
    return { ok: false, error: "Please see the front desk to check in." };
  }

  const updated = await prisma.encounter.update({
    where: { id: enc.id },
    data: next.data as Prisma.EncounterUpdateInput,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: user.id,
      action: "encounter.kiosk_check_in.completed",
      subjectType: "Encounter",
      subjectId: enc.id,
      metadata: { from: enc.status, to: "checked_in", channel: "kiosk_login" },
    },
  });

  logger.info({ event: "kiosk.check_in.success", encounterId: enc.id, orgId });

  return { ok: true, status: updated.status, alreadyCheckedIn: false };
}

export interface KioskHandoffResult {
  ok: boolean;
  error?: string;
  /** URL the QR encodes — the patient's phone opens this. */
  lobbyUrl?: string;
  /** A ready-to-render QR image URL for that lobby URL. */
  qrUrl?: string;
  expiresAt?: string;
}

/**
 * Mint a hand-off "claim ticket" for the identified patient and return a QR the
 * walk-in can scan to continue on their own phone. Re-verifies the patient is
 * in the kiosk's own org; never trusts the client id.
 */
export async function issueKioskHandoff(patientId: string): Promise<KioskHandoffResult> {
  const user = await requireRole("kiosk");
  const orgId = user.organizationId;
  if (!orgId) return { ok: false, error: "This kiosk isn't linked to a clinic yet." };

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) {
    return { ok: false, error: "We couldn't find your record. Please see the front desk." };
  }

  // Phone hand-off needs a public origin to point the QR at; if unset, the
  // kiosk should just let them continue here rather than render a broken QR.
  if (!appOrigin()) {
    return { ok: false, error: "Phone hand-off isn't set up here yet — please continue on the kiosk." };
  }

  const issued = await issueHandoffToken({ patientId: patient.id, organizationId: orgId });

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: user.id,
      action: "kiosk.handoff.issued",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: { channel: "kiosk_qr" },
    },
  });

  logger.info({ event: "kiosk.handoff.issued", orgId });

  return {
    ok: true,
    lobbyUrl: issued.lobbyUrl,
    qrUrl: issued.qrUrl,
    expiresAt: issued.expiresAt.toISOString(),
  };
}
