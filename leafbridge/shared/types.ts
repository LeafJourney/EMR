// Shared types used across the LeafBridge trust + orchestration layer.
//
// These map onto familiar FHIR / governance concepts so each module
// (Consent & Policy Gateway, Clinical RAG, Agent Orchestrator) speaks
// the same language about who is doing what, to which data, for what
// purpose.

/**
 * Purpose-of-use. Maps to HL7 v3 PurposeOfUse codes (TREATMENT, PAYMENT,
 * HOPERAT (ops), HRESCH (research)). Same user can switch purpose and
 * see different data — that is the whole point of policy-based access.
 */
export type PurposeOfUse = "treatment" | "payment" | "operations" | "research";

/**
 * Data class. Coarse partition of clinical data used for consent +
 * policy decisions. Sensitive classes (behavioral health, SUD,
 * reproductive health) intentionally call out the regulated subsets
 * even though MVP segmentation work lands later.
 */
export type DataClass =
  | "demographics"
  | "labs"
  | "notes"
  | "medications"
  | "vitals"
  | "imaging"
  | "behavioral-health"
  | "substance-use"
  | "reproductive-health"
  | "billing";

/** Coarse subject role. Humans + AI agents are first-class identities. */
export type SubjectKind = "user" | "agent";

/** Human / RBAC role. Agents carry their own tier, not a clinical role. */
export type UserRole =
  | "clinician"
  | "nurse"
  | "care-coordinator"
  | "biller"
  | "admin"
  | "researcher"
  | "patient";

/**
 * Agent autonomy tier — see Module 6 / EMR-768.
 *   0  No PHI
 *   1  De-identified only
 *   2  Read-only patient context
 *   3  Draft clinical / admin action (requires human approval)
 *   4  Execute with human approval (admin workflows only in MVP)
 *   5  Autonomous execution (future, tightly bounded)
 */
export type AutonomyTier = 0 | 1 | 2 | 3 | 4 | 5;

/** Calling identity for a policy / retrieval / agent request. */
export type Subject =
  | {
      kind: "user";
      id: string;
      role: UserRole;
      /** Optional list of patient IDs this user is on the care team for. */
      careTeamPatientIds?: readonly string[];
    }
  | {
      kind: "agent";
      id: string;
      /** Tier governs what an agent may attempt before policy further restricts. */
      autonomyTier: AutonomyTier;
    };

/**
 * Append-only audit event. Inspired by FHIR AuditEvent but trimmed to
 * the fields a small in-process ledger needs to be useful.
 */
export interface AuditEvent {
  /** Stable, opaque identifier. Used to correlate decisions across modules. */
  id: string;
  /** ISO timestamp at write time. */
  at: string;
  /** What happened (e.g. "policy.deny", "rag.retrieve", "agent.approve"). */
  action: string;
  /** Outcome: success or block. */
  outcome: "allow" | "deny" | "info";
  /** Subject that took the action. */
  subject: Subject;
  /** Patient the access concerns, when applicable. */
  patientId?: string;
  /** Purpose-of-use claimed by the subject. */
  purposeOfUse?: PurposeOfUse;
  /** Data classes touched by the request. */
  dataClasses?: readonly DataClass[];
  /** Free-form, structured reason. */
  reason?: string;
  /** Arbitrary structured detail — kept small. */
  detail?: Record<string, unknown>;
}
