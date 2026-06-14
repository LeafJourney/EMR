// At-rest encryption for third-party integration secrets (OAuth access
// tokens + token secrets) stored on DeviceConnection.
//
// These tokens grant access to a patient's biometric data, so HIPAA's
// minimum-necessary / at-rest-encryption posture applies just as it does to
// message bodies and documents. We reuse the AES-256-GCM envelope pattern
// from `communications/message-crypto.ts`:
//
//   base64( iv (12B) || tag (16B) || ciphertext )
//
// Key resolution prefers a dedicated INTEGRATION_TOKEN_ENCRYPTION_KEY and
// falls back to MESSAGE_ENCRYPTION_KEY / DOCUMENT_ENCRYPTION_KEY so dev
// environments don't need a third secret. Production should set a dedicated
// key per the minimum-necessary principle.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm" as const;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** A short, stable prefix so we can recognise our own envelopes and treat
 *  any legacy plaintext token (e.g. the old `mock-garmin-token`) as
 *  unreadable rather than mis-decrypting it. */
const ENVELOPE_PREFIX = "v1:";

function getMasterKey(): Buffer {
  const hex =
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY ??
    process.env.MESSAGE_ENCRYPTION_KEY ??
    process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "INTEGRATION_TOKEN_ENCRYPTION_KEY (or MESSAGE_ENCRYPTION_KEY / " +
        "DOCUMENT_ENCRYPTION_KEY) env var is required to store integration tokens",
    );
  }
  if (hex.length !== KEY_BYTES * 2) {
    throw new Error(
      `INTEGRATION_TOKEN_ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex chars (got ${hex.length})`,
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENVELOPE_PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptToken(envelope: string): string {
  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    throw new Error("integration token envelope: unrecognised format");
  }
  const blob = Buffer.from(envelope.slice(ENVELOPE_PREFIX.length), "base64");
  if (blob.length < IV_BYTES + TAG_BYTES) {
    throw new Error("integration token envelope too short");
  }
  const key = getMasterKey();
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Decrypt, returning null instead of throwing when the value is missing,
 * a legacy plaintext token, or undecryptable (rotated key). Callers treat
 * null as "no usable token → the patient must reconnect".
 */
export function decryptTokenSafe(
  envelope: string | null | undefined,
): string | null {
  if (!envelope) return null;
  try {
    return decryptToken(envelope);
  } catch {
    return null;
  }
}
