import type {
  AutonomyTier,
  DataClass,
  PurposeOfUse,
  Subject,
  UserRole,
} from "../shared/types";

// ---------------------------------------------------------------------------
// FHIR Consent (subset)
// ---------------------------------------------------------------------------
// We model the parts of the FHIR Consent resource the gateway actually
// uses for MVP enforcement. Full resource support is straightforward to
// add later (provisions, exceptions, etc).

export interface ConsentProvision {
  /** Permit or deny rule. FHIR `provision.type` */
  type: "permit" | "deny";
  /** Purposes covered by this provision. Empty array = any purpose. */
  purposes: readonly PurposeOfUse[];
  /** Data classes covered. Empty array = any data class. */
  dataClasses: readonly DataClass[];
  /** Optional subject role restriction (e.g. only clinicians on the care team). */
  actorRoles?: readonly UserRole[];
}

export interface FhirConsent {
  /** FHIR Consent.id */
  id: string;
  /** Patient the consent is about. */
  patientId: string;
  /** FHIR Consent.status — only "active" consents are evaluated. */
  status: "active" | "inactive" | "rejected";
  /** ISO timestamp the consent became valid. */
  effectiveDate: string;
  /** Rules. First matching deny wins. Default deny if no provision permits. */
  provisions: readonly ConsentProvision[];
}

// ---------------------------------------------------------------------------
// Policy (gateway side, separate from per-patient consent)
// ---------------------------------------------------------------------------

/** Action being attempted. Reads and writes are distinguished. */
export type AccessAction = "read" | "write";

/** Policy applied to a specific kind of subject. */
export interface RolePolicy {
  /** Matches a human role. */
  role: UserRole;
  /** Purposes this role may claim. */
  allowedPurposes: readonly PurposeOfUse[];
  /** Data classes this role may access. */
  allowedDataClasses: readonly DataClass[];
  /** Actions this role may perform. */
  allowedActions: readonly AccessAction[];
  /**
   * If true the user must be on the patient's care team to access PHI for
   * this role/purpose combination. Treatment access usually requires this.
   */
  requireCareTeamForTreatment?: boolean;
}

export interface AgentPolicy {
  /** Matches an agent by identity. Wildcard `*` matches any agent. */
  agentId: string | "*";
  /** Tier ceiling — agent's runtime tier must be <= this. */
  maxTier: AutonomyTier;
  /** Purposes this agent may claim. */
  allowedPurposes: readonly PurposeOfUse[];
  /** Data classes this agent may access. */
  allowedDataClasses: readonly DataClass[];
  /** Actions this agent may perform. Write-back requires tier 3+. */
  allowedActions: readonly AccessAction[];
}

export interface PolicyBundle {
  rolePolicies: readonly RolePolicy[];
  agentPolicies: readonly AgentPolicy[];
}

// ---------------------------------------------------------------------------
// Access request / decision
// ---------------------------------------------------------------------------

export interface AccessRequest {
  subject: Subject;
  patientId: string;
  purposeOfUse: PurposeOfUse;
  action: AccessAction;
  dataClasses: readonly DataClass[];
  /** Optional list of fields the caller intends to read. Used by min-necessary. */
  requestedFields?: readonly string[];
  /** Optional structured note for the audit trail. */
  reason?: string;
}

export interface AccessDecisionAllow {
  allow: true;
  /** Audit event id written for this decision. */
  auditId: string;
  /** Data classes the caller is cleared to access. Always a subset of request. */
  allowedDataClasses: readonly DataClass[];
  /** Fields the caller may keep after min-necessary filtering. */
  allowedFields: readonly string[];
}

export interface AccessDecisionDeny {
  allow: false;
  auditId: string;
  reason: string;
  /** Stable code so callers can branch / display friendly messages. */
  code: "no-role-policy" | "no-agent-policy" | "tier-exceeded" | "purpose-forbidden" | "action-forbidden" | "data-class-forbidden" | "not-on-care-team" | "consent-denied" | "consent-missing";
}

export type AccessDecision = AccessDecisionAllow | AccessDecisionDeny;
