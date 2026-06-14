// Typed errors shared across wearable providers.

/** Provider rejected our access token mid-request (401/403). The orchestrator
 *  may attempt a refresh; if that fails it surfaces a reconnect prompt. */
export class ProviderAuthError extends Error {
  constructor(message = "provider rejected the access token") {
    super(message);
    this.name = "ProviderAuthError";
  }
}

/** The connection has no usable credentials — the patient must re-authorize. */
export class ProviderReconnectError extends Error {
  constructor(message = "This connection needs to be re-authorized.") {
    super(message);
    this.name = "ProviderReconnectError";
  }
}
