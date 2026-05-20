import type { AuditLedger } from "../shared/audit";
import { InMemoryAuditLedger } from "../shared/audit";
import { InvalidRequestError } from "../shared/errors";
import type { AccessDecision, AccessRequest, PolicyBundle } from "./types";
import type { ConsentStore } from "./consent-store";
import { InMemoryConsentStore, evaluateConsent } from "./consent-store";
import { allowedFieldList } from "./min-necessary";
import type { FieldDataClassMap } from "./min-necessary";
import { evaluatePolicy } from "./policy-engine";

export interface ConsentPolicyGatewayConfig {
  policies: PolicyBundle;
  /** Optional consent store. Defaults to in-memory. */
  consents?: ConsentStore;
  /** Optional audit ledger. Defaults to in-memory. */
  audit?: AuditLedger;
  /**
   * Optional global field→data-class map used by min-necessary filtering
   * when the caller passes `requestedFields`. Callers can also pass an
   * override per call.
   */
  fieldClasses?: FieldDataClassMap;
}

/**
 * The Consent & Policy Gateway is the single chokepoint every data
 * access — human or agent — must pass through. The flow:
 *
 *   1. Validate the request (must name patient + purpose-of-use).
 *   2. Policy check: does the subject's role/agent policy allow this
 *      action, on this purpose, against these data classes?
 *   3. Consent check: does the patient's active consent permit this
 *      purpose + data classes for this actor?
 *   4. Min-necessary: reduce the field list to only those covered by
 *      the cleared data classes.
 *   5. Audit: write an AuditEvent for the decision (allow or deny).
 *
 * Every call produces an audit event — there are no silent rejections.
 */
export class ConsentPolicyGateway {
  private readonly policies: PolicyBundle;
  private readonly consents: ConsentStore;
  private readonly fieldClasses: FieldDataClassMap;
  readonly audit: AuditLedger;

  constructor(config: ConsentPolicyGatewayConfig) {
    this.policies = config.policies;
    this.consents = config.consents ?? new InMemoryConsentStore();
    this.audit = config.audit ?? new InMemoryAuditLedger();
    this.fieldClasses = config.fieldClasses ?? {};
  }

  /** Expose the consent store so seed flows can register consents. */
  consentStore(): ConsentStore {
    return this.consents;
  }

  /**
   * Evaluate an access request. Never throws on a policy/consent denial;
   * returns a structured decision instead. Throws only on programmer
   * errors (e.g. missing patientId).
   */
  evaluate(request: AccessRequest, fieldClasses?: FieldDataClassMap): AccessDecision {
    if (!request.patientId) {
      throw new InvalidRequestError("patientId is required", { request });
    }
    if (!request.purposeOfUse) {
      throw new InvalidRequestError("purposeOfUse is required", { request });
    }

    const policyResult = evaluatePolicy(this.policies, request);
    if (!policyResult.allowed) {
      const event = this.audit.write({
        action: `gateway.deny.${policyResult.code}`,
        outcome: "deny",
        subject: request.subject,
        patientId: request.patientId,
        purposeOfUse: request.purposeOfUse,
        dataClasses: request.dataClasses,
        reason: policyResult.reason,
        detail: { action: request.action, requestedReason: request.reason },
      });
      return {
        allow: false,
        auditId: event.id,
        reason: policyResult.reason,
        code: policyResult.code,
      };
    }

    const consent = this.consents.current(request.patientId);
    const actorRole = request.subject.kind === "user" ? request.subject.role : undefined;
    const consentResult = evaluateConsent(consent, {
      purposeOfUse: request.purposeOfUse,
      dataClasses: policyResult.allowedDataClasses,
      actorRole,
    });
    if (!consentResult.allowed) {
      const event = this.audit.write({
        action: `gateway.deny.${consentResult.code}`,
        outcome: "deny",
        subject: request.subject,
        patientId: request.patientId,
        purposeOfUse: request.purposeOfUse,
        dataClasses: policyResult.allowedDataClasses,
        reason: consentResult.reason,
      });
      return {
        allow: false,
        auditId: event.id,
        reason: consentResult.reason,
        code: consentResult.code,
      };
    }

    const map = fieldClasses ?? this.fieldClasses;
    const allowedFields = request.requestedFields
      ? allowedFieldList(request.requestedFields, map, policyResult.allowedDataClasses)
      : [];

    const event = this.audit.write({
      action: `gateway.allow.${request.action}`,
      outcome: "allow",
      subject: request.subject,
      patientId: request.patientId,
      purposeOfUse: request.purposeOfUse,
      dataClasses: policyResult.allowedDataClasses,
      reason: request.reason,
      detail: { allowedFields },
    });

    return {
      allow: true,
      auditId: event.id,
      allowedDataClasses: policyResult.allowedDataClasses,
      allowedFields,
    };
  }
}
