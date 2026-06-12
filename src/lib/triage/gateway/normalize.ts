// Inbound Message Gateway — channel-agnostic normalization (EMR-1145).
//
// Phase 1 of the "Asynchronous Triage & Smart Check-ins" red-text spec
// (docs/product-feedback/2026-06-12_workflows-revisions-red-text.md):
// every inbound patient message — SMS webhook or portal — is reduced to ONE
// normalized shape before triage/ingest, so the UPI engine and the Smart
// Inbox see identical input regardless of transport.
//
// The clinical normalization (lowercase, artifact stripping, whitespace
// collapse, abbreviation expansion: "sob" → "shortness of breath") is NOT
// re-implemented here — it is the UPI engine's `normalizeMessageText`
// (src/lib/triage/upi/entities.ts), reused so the gateway and the triage
// engine can never drift apart on what "normalized" means.

import { normalizeMessageText } from "@/lib/triage/upi";

/** Transports the gateway accepts today. */
export type InboundChannel = "sms" | "portal";

/** The one normalized inbound-message shape every channel funnels into. */
export interface NormalizedInboundMessage {
  /** Matched patient — null when the sender could not be identified. */
  patientId: string | null;
  channel: InboundChannel;
  receivedAt: Date;
  /**
   * What the patient actually wrote, minus transport junk (zero-width
   * characters, stray control chars, duplicate whitespace). Case and
   * punctuation are preserved — this is what gets stored on the thread.
   */
  rawBody: string;
  /**
   * UPI-normalized text (lowercased, artifacts stripped, clinical
   * shorthand expanded). This is what gets triaged — never stored as the
   * patient's message.
   */
  normalizedBody: string;
  /** True only when the transport authenticated the sender (shared-secret
   *  webhook + exact phone match, or an authenticated portal session). */
  senderVerified: boolean;
  /** Provider message id (e.g. Twilio MessageSid) for idempotency. */
  externalId?: string | null;
}

/**
 * Strip messaging-transport artifacts while preserving the patient's own
 * words: zero-width/invisible Unicode, control characters, and duplicated
 * whitespace. Unlike `normalizeMessageText` this keeps case + punctuation,
 * so the stored message reads exactly as the patient typed it.
 */
export function stripMessagingArtifacts(raw: string): string {
  return (raw ?? "")
    // Zero-width + BOM + word-joiner characters smuggled in by SMS clients.
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "")
    // Control characters except \n and \t (kept, then collapsed below).
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // Curly quotes \u2192 straight, mirroring the UPI normalizer.
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Duplicate whitespace (incl. newlines/tabs) \u2192 single space.
    .replace(/\s+/g, " ")
    .trim();
}

export interface NormalizeInboundInput {
  patientId: string | null;
  channel: InboundChannel;
  rawBody: string;
  senderVerified: boolean;
  receivedAt?: Date;
  externalId?: string | null;
}

/**
 * Build the channel-agnostic normalized inbound-message shape.
 * Pure — no I/O; callers (webhook route, portal path) verify the sender
 * BEFORE setting `senderVerified`.
 */
export function normalizeInboundMessage(
  input: NormalizeInboundInput,
): NormalizedInboundMessage {
  const rawBody = stripMessagingArtifacts(input.rawBody);
  return {
    patientId: input.patientId,
    channel: input.channel,
    receivedAt: input.receivedAt ?? new Date(),
    rawBody,
    // Abbreviation expansion + clinical normalization come from the UPI
    // engine — one dictionary, owned in one place.
    normalizedBody: normalizeMessageText(rawBody),
    senderVerified: input.senderVerified,
    externalId: input.externalId ?? null,
  };
}
