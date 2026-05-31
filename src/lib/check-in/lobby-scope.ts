// EMR-915 — scope + task-list resolution for the kiosk→phone lobby session.
//
// ARCHITECTURE: the lobby session is a DELEGATED, SCOPED, EXPIRING patient
// session. It is NOT a role and grants NOTHING on its own. This module is the
// single place that decides:
//   1. which completion workflows a lobby session may reach (`LOBBY_WORKFLOWS`),
//   2. which of those are still OUTSTANDING for the patient's visit, derived
//      ONLY from the canonical readiness source (getAppointmentReadiness /
//      evaluatePrevisitReadiness).
//
// The patient is "only let into the room prepared for them": a workflow that is
// not outstanding (or not in the allow-list) must be blocked by the lobby
// guard. Chart / records / messages / other patients are NEVER in scope here.
//
// PHI hygiene: the task list carries only requirement ids + static labels — no
// patient data. Mirrors the PHI-free contract of PrevisitReadiness.

import {
  evaluatePrevisitReadiness,
  loadPrevisitSnapshot,
  type PrevisitReadiness,
} from "@/lib/scheduling/previsit-readiness";
import { prisma } from "@/lib/db/prisma";

/** The only completion surfaces a lobby session may ever reach. */
export const LOBBY_WORKFLOWS = ["intake", "consent"] as const;
export type LobbyWorkflow = (typeof LOBBY_WORKFLOWS)[number];

export function isLobbyWorkflow(value: string): value is LobbyWorkflow {
  return (LOBBY_WORKFLOWS as readonly string[]).includes(value);
}

/**
 * Map a gate requirement id (from intake-gate) to the lobby workflow that
 * resolves it. Requirements that the lobby can't resolve on a phone (photo ID,
 * insurance card, demographics editing) map to `null` — they stay the front
 * desk's job and are never surfaced as a lobby task.
 */
export function workflowForRequirement(requirementId: string): LobbyWorkflow | null {
  switch (requirementId) {
    case "cannabis_history":
    case "presenting_concerns":
      return "intake";
    case "consent":
      return "consent";
    // demographics, id_age_verification, allergy_screen,
    // insurance_or_attestation, outcome_log_since_last_visit — not a phone task.
    default:
      return null;
  }
}

export interface LobbyTask {
  /** The lobby workflow this task drives. */
  workflow: LobbyWorkflow;
  /** Static, PHI-free label for the task card. */
  label: string;
  /**
   * Absolute path the patient taps to complete it. The lobby session is
   * cookie-based once minted, so the completion surfaces are NOT token-scoped in
   * the URL — they re-derive the patient from the path-scoped cookie.
   */
  href: string;
  /**
   * True once the patient has staged a (still-pending) submission for this
   * workflow. The task stays IN SCOPE — they can re-open it to edit — but it's
   * rendered as "submitted, pending review" so the lobby has a terminal state the
   * patient reaches by their own action, instead of a perpetual to-do. A staged
   * submission satisfies NOTHING in the clinical readiness gate; this flag is
   * display state only and never widens `allowed`.
   */
  submitted: boolean;
}

const TASK_LABELS: Record<LobbyWorkflow, string> = {
  intake: "Tell us why you're here",
  consent: "Review & sign your consent forms",
};

/**
 * Resolve the patient's outstanding lobby tasks from readiness. `missingIds`
 * are the blocking requirement ids from PrevisitReadiness; we keep only the
 * ones a phone workflow can resolve, de-duplicated, in workflow order.
 * `submittedWorkflows` are those with a staged-but-pending submission, flagged
 * for display — they remain outstanding tasks (the chart isn't written until
 * staff accept) but render as already submitted.
 */
export function resolveLobbyTasks(
  missingIds: readonly string[],
  submittedWorkflows: ReadonlySet<LobbyWorkflow> = new Set(),
): LobbyTask[] {
  const outstanding = new Set<LobbyWorkflow>();
  for (const id of missingIds) {
    const wf = workflowForRequirement(id);
    if (wf) outstanding.add(wf);
  }
  return LOBBY_WORKFLOWS.filter((wf) => outstanding.has(wf)).map((wf) => ({
    workflow: wf,
    label: TASK_LABELS[wf],
    href: `/kiosk/lobby/${wf}`,
    submitted: submittedWorkflows.has(wf),
  }));
}

export interface LobbyReadinessView {
  readiness: PrevisitReadiness;
  tasks: LobbyTask[];
  /** Workflows still outstanding (the lobby's effective allow-scope). */
  allowed: LobbyWorkflow[];
  /**
   * True when there's nothing left for the patient to DO here: either no
   * phone-resolvable task is outstanding, or every outstanding task has already
   * been submitted and is awaiting staff review. The terminal "you're all set"
   * state — reachable by the patient's own action, not only after staff accept.
   */
  allDone: boolean;
}

/**
 * The patient's nearest in-scope appointment for readiness. The lobby session
 * carries only patientId, so we resolve the appointment server-side: today's
 * (or next upcoming) booked appointment for this patient in this org. Returns
 * null when there's no appointment to ready for.
 */
export async function findLobbyAppointmentId(
  patientId: string,
  organizationId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  // Appointment is scoped to the patient (no direct org column); re-derive the
  // org from the patient relation so a lobby session can't reach across orgs.
  const appt = await prisma.appointment.findFirst({
    where: {
      patientId,
      patient: { organizationId },
      startAt: { gte: dayStart },
      status: { notIn: ["cancelled", "completed", "no_show"] },
    },
    orderBy: { startAt: "asc" },
    select: { id: true },
  });
  return appt?.id ?? null;
}

/**
 * Build the lobby readiness view for a patient. Derives outstanding tasks from
 * the canonical readiness for their appointment. If no appointment exists, we
 * fall back to a snapshot-less "offer both workflows" so a walk-in without a
 * booked slot can still complete intake/consent — but we never invent a
 * readiness number.
 */
export async function getLobbyReadinessView(
  patientId: string,
  organizationId: string,
  now: Date = new Date(),
): Promise<LobbyReadinessView> {
  const appointmentId = await findLobbyAppointmentId(patientId, organizationId, now);

  let missingIds: string[];
  let readiness: PrevisitReadiness;

  if (appointmentId) {
    const loaded = await loadPrevisitSnapshot(appointmentId);
    if (loaded && loaded.patientId === patientId) {
      readiness = evaluatePrevisitReadiness(loaded.snapshot, now);
      missingIds = readiness.missingRequiredIds;
    } else {
      readiness = emptyReadiness();
      missingIds = [...LOBBY_WORKFLOWS];
    }
  } else {
    // No appointment to ready for — offer both completion workflows.
    readiness = emptyReadiness();
    missingIds = [...LOBBY_WORKFLOWS];
  }

  const submittedWorkflows = await loadSubmittedWorkflows(patientId, organizationId);
  const tasks = resolveLobbyTasks(missingIds, submittedWorkflows);

  // Scope is the outstanding tasks — UNCHANGED by submission state, so a patient
  // can re-open a submitted workflow to correct an answer (getLobbyScopeFor keys
  // off this, never the `submitted` display flag).
  const allowed = tasks.map((t) => t.workflow);

  // Terminal once there's nothing left to do: no outstanding task, OR every
  // outstanding task is already submitted and waiting on staff review.
  const allDone = tasks.length === 0 || tasks.every((t) => t.submitted);

  return { readiness, tasks, allowed, allDone };
}

/**
 * Which lobby workflows the patient has already staged a still-pending
 * submission for. Used only to render "submitted, pending review" — staged data
 * never satisfies the clinical readiness gate.
 */
async function loadSubmittedWorkflows(
  patientId: string,
  organizationId: string,
): Promise<Set<LobbyWorkflow>> {
  const rows = await prisma.kioskLobbySubmission.findMany({
    where: { patientId, organizationId, status: "pending" },
    select: { kind: true },
  });
  const submitted = new Set<LobbyWorkflow>();
  for (const r of rows) {
    if (isLobbyWorkflow(r.kind)) submitted.add(r.kind);
  }
  return submitted;
}

function emptyReadiness(): PrevisitReadiness {
  return {
    isReady: false,
    missingRequiredIds: [...LOBBY_WORKFLOWS],
    outstandingRequiredCount: LOBBY_WORKFLOWS.length,
    completionPct: 0,
  };
}
