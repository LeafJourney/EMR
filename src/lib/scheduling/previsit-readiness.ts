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
  type GateRequirementId,
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

/**
 * Consent freshness policy, in days (`null` = the consent never expires).
 *
 * Defaults to `null`/`null` so this change is behaviour-preserving: existing
 * signed consents keep satisfying the gate exactly as before. Turning freshness
 * ON (the plan's recommendation — visit/treatment ~365d, telehealth per-visit)
 * is a one-line product decision tracked in EMR-913 + the plan doc §1, made here
 * so the policy lives in one place rather than scattered through callers.
 */
export const CONSENT_FRESHNESS_POLICY: {
  visitConsentMaxAgeDays: number | null;
  telehealthConsentMaxAgeDays: number | null;
} = {
  visitConsentMaxAgeDays: null,
  telehealthConsentMaxAgeDays: null,
};

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
      visitConsentMaxAgeDays: CONSENT_FRESHNESS_POLICY.visitConsentMaxAgeDays,
      telehealthConsentMaxAgeDays: CONSENT_FRESHNESS_POLICY.telehealthConsentMaxAgeDays,
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
  now: Date,
): PrevisitReadiness {
  const gate = evaluateIntakeGate(mapSnapshotToGateInput(snapshot), now);
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

/**
 * A missing blocking requirement with its display label + deep link, for UI
 * surfaces (the portal "get ready" banner, the clinician dashboard). Labels are
 * static UI strings — not PHI — but this richer view is intentionally kept OFF
 * the PHI-free `PrevisitReadiness` summary so labels never ride into nudge
 * routing or audit metadata. The href is the gate's own `resolveHref`, so the
 * "where do I fix this" mapping lives in ONE place (EMR-914).
 */
export interface MissingRequirement {
  id: GateRequirementId;
  label: string;
  href?: string;
}

export function missingBlockingRequirements(
  snapshot: PrevisitSnapshot,
  now: Date,
): MissingRequirement[] {
  const gate = evaluateIntakeGate(mapSnapshotToGateInput(snapshot), now);
  return gate.requirements
    .filter((r) => r.blocking && !r.satisfied)
    .map((r) => ({ id: r.id, label: r.label, href: r.resolveHref }));
}

// ---------------------------------------------------------------------------
// Prisma loader (thin DB read -> snapshot)
// ---------------------------------------------------------------------------

/**
 * Derive visit type from the patient's history (EMR-913). We don't store
 * visitType on Appointment, so we infer the gate-relevant distinction —
 * new patient vs established — from whether the patient has ever completed an
 * encounter. This drives the requirements that only block new patients
 * (id/age verification, cannabis history).
 *
 * Bias to `new_patient` when uncertain: that asks for MORE up front, which is
 * the safe direction for a clinical gate. `renewal`/`group`/`urgent` need
 * explicit booking signals and are out of scope for derivation today.
 */
export function deriveVisitType(
  completedEncounterCount: number,
): IntakeGateInput["visitType"] {
  return completedEncounterCount > 0 ? "follow_up" : "new_patient";
}

/**
 * Load a PrevisitSnapshot for an appointment from the database. This is the
 * only DB-touching function here; everything above is pure. Returns null when
 * the appointment (or its patient) can't be found.
 *
 * `visitType` is derived from encounter history (see `deriveVisitType`).
 * `treatmentPhase` still defaults to `intake`: it only feeds the *non-blocking*
 * outcome-log advisory, and real phase tracking belongs with the cadence /
 * treatment-state work (cadence-engine TreatmentPhase) — deferred follow-on.
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

  // New patient vs established — derived from whether they've ever completed a
  // visit (EMR-913). Drives the new-patient-only blocking requirements.
  const completedEncounterCount = await prisma.encounter.count({
    where: { patientId: p.id, status: "complete" },
  });

  const snapshot: PrevisitSnapshot = {
    visitType: deriveVisitType(completedEncounterCount),
    treatmentPhase: "intake",
    isVirtual: appt.modality === "video" || appt.modality === "phone",
    patient: {
      dateOfBirth: p.dateOfBirth,
      addressLine1: p.addressLine1,
      state: p.state,
      ageVerifiedAt: p.ageVerifiedAt,
      // EMR-913 — real screened-at column. Set on any allergy edit and by the
      // explicit "reviewed / no known allergies" action, so an NKDA review
      // counts as screened (the old `allergies.length > 0` proxy did not).
      allergiesScreenedAt: p.allergiesScreenedAt,
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
  /** Missing blocking requirements with labels + deep links, for UI surfaces. */
  missingRequirements: MissingRequirement[];
  patientId: string;
  organizationId: string;
}

/**
 * Load + evaluate readiness for an appointment in one call. Returns null when
 * the appointment can't be found. The returned readiness is PHI-free.
 *
 * CANONICAL SOURCE OF TRUTH (EMR-913). This is *the* answer to "is this patient
 * ready for this visit / what's still missing." Every surface — the pre-visit
 * nudge engine (sendDuePrevisitCompletionReminders), the patient portal "get
 * ready" banner, the clinician readiness dashboard, and the kiosk/lobby
 * completion flow — must read readiness from here (or `evaluatePrevisitReadiness`
 * for an in-memory snapshot), NOT from the chart-completeness score
 * (intake-agent's 0–100 on ChartSummary) and NOT from ad-hoc `briefingContext`
 * signals. Chart completeness is an *input* to a productive visit, not a
 * parallel definition of "ready" — keeping one definition here is what stops the
 * three readiness notions from drifting apart again.
 */
export async function getAppointmentReadiness(
  appointmentId: string,
  now: Date,
): Promise<AppointmentReadiness | null> {
  const loaded = await loadPrevisitSnapshot(appointmentId);
  if (!loaded) return null;
  return {
    readiness: evaluatePrevisitReadiness(loaded.snapshot, now),
    missingRequirements: missingBlockingRequirements(loaded.snapshot, now),
    patientId: loaded.patientId,
    organizationId: loaded.organizationId,
  };
}

export interface UpcomingVisitReadiness {
  appointmentId: string;
  startAt: Date;
  readiness: PrevisitReadiness;
  missingRequirements: MissingRequirement[];
}

/**
 * Readiness for a PATIENT's next upcoming appointment (the portal "get ready"
 * banner's entry point). Resolves the soonest still-open appointment, then reads
 * the canonical readiness for it. Returns null when the patient has no upcoming
 * appointment. Mirrors the nudge engine's appointment scope (requested/confirmed,
 * in the future) so the banner and the SMS/email nudges agree on "next visit".
 */
export async function getNextAppointmentReadinessForPatient(
  patientId: string,
  now: Date,
): Promise<UpcomingVisitReadiness | null> {
  const appt = await prisma.appointment.findFirst({
    where: {
      patientId,
      status: { in: ["requested", "confirmed"] },
      startAt: { gt: now },
    },
    orderBy: { startAt: "asc" },
    select: { id: true, startAt: true },
  });
  if (!appt) return null;

  const r = await getAppointmentReadiness(appt.id, now);
  if (!r) return null;

  return {
    appointmentId: appt.id,
    startAt: appt.startAt,
    readiness: r.readiness,
    missingRequirements: r.missingRequirements,
  };
}
