import type { DataClass, PurposeOfUse, UserRole } from "../shared/types";
import type { FhirConsent } from "./types";

/**
 * Source of patient consents. Production wires this to the FHIR server;
 * MVP uses an in-memory implementation that supports the same call
 * signatures so callers don't need to change.
 */
export interface ConsentStore {
  /** Return the most recent active consent for a patient, if any. */
  current(patientId: string): FhirConsent | null;
  /** Replace (or seed) consents for a patient. */
  set(consent: FhirConsent): void;
  /** Bulk replace, used in tests + seed flows. */
  seed(consents: readonly FhirConsent[]): void;
  /** Remove all consents for a patient. */
  clear(patientId: string): void;
}

export class InMemoryConsentStore implements ConsentStore {
  private readonly byPatient = new Map<string, FhirConsent[]>();

  current(patientId: string): FhirConsent | null {
    const list = this.byPatient.get(patientId);
    if (!list || list.length === 0) return null;
    // Latest effectiveDate wins; status must be active.
    const active = list
      .filter((c) => c.status === "active")
      .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
    return active[0] ?? null;
  }

  set(consent: FhirConsent): void {
    const list = this.byPatient.get(consent.patientId) ?? [];
    list.push(consent);
    this.byPatient.set(consent.patientId, list);
  }

  seed(consents: readonly FhirConsent[]): void {
    this.byPatient.clear();
    for (const c of consents) this.set(c);
  }

  clear(patientId: string): void {
    this.byPatient.delete(patientId);
  }
}

/**
 * Decide whether a patient's active consent permits the request. The
 * function is pure — given a consent + a request, the outcome is
 * deterministic. Returns a structured result so callers can write a
 * useful audit reason on denial.
 */
export interface ConsentCheckRequest {
  purposeOfUse: PurposeOfUse;
  dataClasses: readonly DataClass[];
  actorRole?: UserRole;
}

export interface ConsentCheckAllow {
  allowed: true;
}

export interface ConsentCheckDeny {
  allowed: false;
  reason: string;
  code: "consent-missing" | "consent-denied";
}

export type ConsentCheckResult = ConsentCheckAllow | ConsentCheckDeny;

export function evaluateConsent(
  consent: FhirConsent | null,
  request: ConsentCheckRequest,
): ConsentCheckResult {
  if (!consent) {
    return {
      allowed: false,
      code: "consent-missing",
      reason: "No active patient consent on file",
    };
  }
  if (consent.status !== "active") {
    return {
      allowed: false,
      code: "consent-missing",
      reason: `Consent status is ${consent.status}`,
    };
  }

  // First matching deny wins. Otherwise need at least one matching permit.
  let permitted = false;
  for (const p of consent.provisions) {
    const purposeMatches = p.purposes.length === 0 || p.purposes.includes(request.purposeOfUse);
    if (!purposeMatches) continue;

    const dataClassMatches =
      p.dataClasses.length === 0 ||
      request.dataClasses.every((c) => p.dataClasses.includes(c));
    if (!dataClassMatches) continue;

    const roleMatches =
      !p.actorRoles || p.actorRoles.length === 0 || (request.actorRole !== undefined && p.actorRoles.includes(request.actorRole));
    if (!roleMatches) continue;

    if (p.type === "deny") {
      return {
        allowed: false,
        code: "consent-denied",
        reason: `Consent ${consent.id} denies ${request.purposeOfUse} access to ${request.dataClasses.join(",")}`,
      };
    }
    if (p.type === "permit") permitted = true;
  }

  if (permitted) return { allowed: true };
  return {
    allowed: false,
    code: "consent-denied",
    reason: `No provision in consent ${consent.id} permits ${request.purposeOfUse} access to ${request.dataClasses.join(",")}`,
  };
}
