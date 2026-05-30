// EMR-212 follow-on — DB-to-gate mapper for pre-visit readiness.
//
// `evaluateIntakeGate` (./intake-gate) is pure and takes an already-shaped
// IntakeGateInput. This module is the binding between *stored* patient /
// appointment / consent / coverage data and that gate:
//
//   PrevisitSnapshot  --mapSnapshotToGateInput-->  IntakeGateInput
//                     --evaluateIntakeGate------->  IntakeGateResult
//                     --(summarize, drop PHI)----->  PrevisitReadiness
//
// The snapshot is deliberately a plain, serializable shape (no Prisma types)
// so the mapping is unit-testable with zero DB. `loadPrevisitSnapshot` is the
// thin Prisma read that produces a snapshot; Codex/app layer can swap or extend
// it without touching the pure mapping/decision logic.

import { prisma } from "@/lib/db/prisma";

import {
  evaluateIntakeGate,
  type IntakeGateInput,
} from "./intake-gate";

// ---------------------------------------------------------------------------
// Snapshot shape (storage-agnostic)
// ---------------------------------------------------------------------------

export interface PrevisitConsentRecord {
  templateName: string;
  version: string;
  signedAt: Date;
}

export interface PrevisitCoverageRecord {
  type: string;
  active: boolean;
  /** Matches PatientCoverage.eligibilityStatus enum, e.g. "active" | "unknown". */
  eligibilityStatus: string;
}

export interface PrevisitSnapshot {
  visitType: IntakeGateInput["visitType"];
  treatmentPhase: IntakeGateInput["treatmentPhase"];
  isVirtual: boolean;
  patient: {
    dateOfBirth: Date | null;
    addressLine1: string | null;
    state: string | null;
    ageVerifiedAt: Date | null;
    allergiesScreenedAt: Date | null;
    cannabisHistory: unknown;
    presentingConcerns: string | null;
    intakeAnswers: unknown;
  };
  consents: PrevisitConsentRecord[];
  coverages: PrevisitCoverageRecord[];
  /** Self-pay attestation captured outside the coverage table. */
  selfPayAttested: boolean;
  outcomeLogsSinceLastVisit: number;
}

// ---------------------------------------------------------------------------
// Pure mapping
// ---------------------------------------------------------------------------

/** A consent is "telehealth" if its template name mentions telehealth/virtual. */
function isTelehealthConsent(name: string): boolean {
  return /telehealth|telemedicine|virtual/i.test(name);
}

/** A consent is the general visit consent if it is signed and not telehealth. */
function isVisitConsent(name: string): boolean {
  return !isTelehealthConsent(name);
}

function latestSignedAt(
  consents: PrevisitConsentRecord[],
  predicate: (name: string) => boolean,
): Date | null {
  const matches = consents
    .filter((c) => predicate(c.templateName))
    .map((c) => c.signedAt)
    .filter((d): d is Date => d instanceof Date);
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.getTime() > a.getTime() ? b : a));
}

/** Coverage counts as verified when an active row reports active eligibility. */
function hasVerifiedCoverage(coverages: PrevisitCoverageRecord[]): boolean {
  return coverages.some(
    (c) => c.active && c.eligibilityStatus.toLowerCase() === "active",
  );
}

export function mapSnapshotToGateInput(snapshot: PrevisitSnapshot): IntakeGateInput {
  return {
    visitType: snapshot.visitType,
    treatmentPhase: snapshot.treatmentPhase,
    isVirtual: snapshot.isVirtual,
    patient: {
      dateOfBirth: snapshot.patient.dateOfBirth,
      addressLine1: snapshot.patient.addressLine1,
      state: snapshot.patient.state,
      allergiesScreenedAt: snapshot.patient.allergiesScreenedAt,
      cannabisHistory: snapshot.patient.cannabisHistory,
      presentingConcerns: snapshot.patient.presentingConcerns,
      intakeAnswers: snapshot.patient.intakeAnswers,
      ageVerifiedAt: snapshot.patient.ageVerifiedAt,
    },
    consent: {
      visitConsentSignedAt: latestSignedAt(snapshot.consents, isVisitConsent),
      telehealthConsentSignedAt: latestSignedAt(snapshot.consents, isTelehealthConsent),
    },
    insurance: {
      coverageVerified: hasVerifiedCoverage(snapshot.coverages),
      selfPayAttested: snapshot.selfPayAttested,
    },
    outcomeLogsSinceLastVisit: snapshot.outcomeLogsSinceLastVisit,
  };
}

// ---------------------------------------------------------------------------
// Readiness decision (PHI-free summary)
// ---------------------------------------------------------------------------

export interface PrevisitReadiness {
  /** True when no *blocking* gate requirement is outstanding. */
  isReady: boolean;
  /** Blocking requirement ids still outstanding (no labels/PHI). */
  missingRequiredIds: string[];
  /** Count of outstanding blocking requirements (drives nudge metadata). */
  outstandingRequiredCount: number;
  /** Completion 0..1 across all requirements (for progress UI). */
  completionPct: number;
}

/**
 * Evaluate readiness from a snapshot. The result is intentionally PHI-free —
 * only requirement ids and counts — so it is safe to attach to reminder-routing
 * decisions and audit metadata. `now` is accepted for parity with callers that
 * key off the current tick; the gate itself is time-independent today.
 */
export function evaluatePrevisitReadiness(
  snapshot: PrevisitSnapshot,
  _now: Date,
): PrevisitReadiness {
  const gate = evaluateIntakeGate(mapSnapshotToGateInput(snapshot));
  const missingRequiredIds = gate.requirements
    .filter((r) => r.blocking && !r.satisfied)
    .map((r) => r.id);

  return {
    isReady: gate.allowConfirm,
    missingRequiredIds,
    outstandingRequiredCount: missingRequiredIds.length,
    completionPct: gate.completionPct,
  };
}

// ---------------------------------------------------------------------------
// Prisma loader (thin DB read -> snapshot)
// ---------------------------------------------------------------------------

const VISIT_TYPE_BY_MODALITY: Record<string, IntakeGateInput["visitType"]> = {
  // Default mapping; the appointment table tracks modality, not visit type,
  // so we treat every booked appointment as a new_patient gate unless a richer
  // visit-type signal is wired in later (Codex handoff).
};

/**
 * Load a PrevisitSnapshot for an appointment from the database. This is the
 * only DB-touching function here; everything above is pure. Returns null when
 * the appointment (or its patient) can't be found.
 *
 * NOTE (Codex handoff): visitType/treatmentPhase are not modeled on Appointment
 * today, so they default to new_patient/intake. When the visit-state spine adds
 * those fields, populate them here — the gate + readiness logic already handles
 * every visit type.
 */
export async function loadPrevisitSnapshot(
  appointmentId: string,
): Promise<{ snapshot: PrevisitSnapshot; patientId: string; organizationId: string } | null> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: {
        include: {
          signedConsents: {
            select: { templateName: true, version: true, signedAt: true },
            orderBy: { signedAt: "desc" },
            take: 25,
          },
          coverages: {
            where: { active: true },
            select: { type: true, active: true, eligibilityStatus: true },
          },
        },
      },
    },
  });

  if (!appt || !appt.patient) return null;
  const p = appt.patient;

  const outcomeLogsSinceLastVisit = await prisma.outcomeLog.count({
    where: { patientId: p.id, loggedAt: { gt: lastVisitBefore(appt.startAt) } },
  });

  const snapshot: PrevisitSnapshot = {
    visitType: VISIT_TYPE_BY_MODALITY[appt.modality] ?? "new_patient",
    treatmentPhase: "intake",
    isVirtual: appt.modality === "video" || appt.modality === "phone",
    patient: {
      dateOfBirth: p.dateOfBirth,
      addressLine1: p.addressLine1,
      state: p.state,
      ageVerifiedAt: p.ageVerifiedAt,
      // allergiesScreenedAt isn't a column; treat a populated allergies/contra
      // array as "screened". Codex can replace with a real screened-at column.
      allergiesScreenedAt:
        p.allergies.length > 0 || p.contraindications.length > 0 ? p.updatedAt : null,
      cannabisHistory: p.cannabisHistory,
      presentingConcerns: p.presentingConcerns,
      intakeAnswers: p.intakeAnswers,
    },
    consents: p.signedConsents.map((c) => ({
      templateName: c.templateName,
      version: c.version,
      signedAt: c.signedAt,
    })),
    coverages: p.coverages.map((c) => ({
      type: c.type,
      active: c.active,
      eligibilityStatus: String(c.eligibilityStatus),
    })),
    selfPayAttested: false,
    outcomeLogsSinceLastVisit,
  };

  return { snapshot, patientId: p.id, organizationId: p.organizationId };
}

/** A coarse "since last visit" floor: 120 days before this appointment. */
function lastVisitBefore(startAt: Date): Date {
  return new Date(startAt.getTime() - 120 * 24 * 60 * 60_000);
}

export interface AppointmentReadiness {
  readiness: PrevisitReadiness;
  patientId: string;
  organizationId: string;
}

/**
 * Load + evaluate readiness for an appointment in one call. Returns null when
 * the appointment can't be found. The returned readiness is PHI-free.
 */
export async function getAppointmentReadiness(
  appointmentId: string,
  now: Date,
): Promise<AppointmentReadiness | null> {
  const loaded = await loadPrevisitSnapshot(appointmentId);
  if (!loaded) return null;
  return {
    readiness: evaluatePrevisitReadiness(loaded.snapshot, now),
    patientId: loaded.patientId,
    organizationId: loaded.organizationId,
  };
}
