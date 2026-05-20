// Typed errors thrown by the trust layer. Callers can `instanceof` on
// these to distinguish "denied by policy" from "denied by consent"
// from "missing required input" without parsing error strings.

export class LeafBridgeError extends Error {
  readonly code: string;
  readonly detail?: Record<string, unknown>;

  constructor(code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.detail = detail;
  }
}

/** Request was rejected by the policy engine. */
export class PolicyDeniedError extends LeafBridgeError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super("policy.denied", message, detail);
  }
}

/** Request was rejected because patient consent forbids it. */
export class ConsentDeniedError extends LeafBridgeError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super("consent.denied", message, detail);
  }
}

/** Caller supplied an incomplete or malformed request. */
export class InvalidRequestError extends LeafBridgeError {
  constructor(message: string, detail?: Record<string, unknown>) {
    super("request.invalid", message, detail);
  }
}
