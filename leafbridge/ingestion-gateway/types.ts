export type IngestionSourceKind =
  | "fhir-bundle"
  | "hl7v2-message"
  | "lab-report"
  | "dispensary-pos"
  | "wearable-metric";

export interface IngestionEnvelope<Payload = unknown> {
  envelopeId: string;
  source: IngestionSourceKind;
  organizationId: string;
  receivedAt: string;
  payload: Payload;
  contentType: string;
  idempotencyKey: string | null;
}

export type IngestionStatus =
  | "accepted"
  | "duplicate"
  | "rejected"
  | "rate_limited";

export interface IngestionReceipt {
  envelopeId: string;
  status: IngestionStatus;
  acceptedAt: string;
  reason: string | null;
}

export interface RateLimitWindow {
  organizationId: string;
  source: IngestionSourceKind;
  windowStartedAt: number;
  count: number;
}
