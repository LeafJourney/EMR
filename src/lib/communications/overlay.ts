// EMR-037 — Communications overlay helpers.
//
// Two responsibilities:
//   1. Simulate the per-session E2E key state shown in the Encrypted
//      Messenger header (publicKey + fingerprint + algorithm tag). We
//      do NOT generate a real Curve25519 keypair here — that would
//      require a libsodium dep and a key-agreement handshake we don't
//      have in this surface. The helpers exist so the UI can render a
//      believable "E2E negotiated" badge with rotating key material.
//   2. Run the live phone-call transcript through a deterministic
//      PHI scrubber that masks SSN/address/credit cards while keeping
//      medical symptoms and billing codes visible — the same shape the
//      AI summarization step expects to receive at finalization.
//
// Both helpers are isomorphic (no `node:crypto` import) so the client
// component can run them on every keystroke without paying for a server
// round-trip.

import { redactToPertinentSummary, type RedactionResult } from "./transcription";

// ---------------------------------------------------------------------------
// E2E key simulation
// ---------------------------------------------------------------------------

export type SessionAlgorithm = "x25519+aes-256-gcm";

export interface SessionKeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
  algorithm: SessionAlgorithm;
  createdAt: string;
}

/**
 * Produce a simulated per-session keypair for the Encrypted Messenger
 * header. Uses `crypto.getRandomValues` when available (browser + modern
 * node) and falls back to `Math.random` in test stubs that strip globals.
 */
export function generateSessionKeyPair(): SessionKeyPair {
  const publicKey = randomBase64(32);
  const privateKey = randomBase64(48);
  return {
    publicKey,
    privateKey,
    fingerprint: fingerprintFromKey(publicKey),
    algorithm: "x25519+aes-256-gcm",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Hex-pair fingerprint for the visible key badge. Five groups of four
 * keep the SAS-style display compact while still distinguishable
 * between sessions. Deterministic so two clients with the same public
 * key will render the same fingerprint.
 */
export function fingerprintFromKey(publicKey: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < publicKey.length; i++) {
    hash ^= publicKey.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, "0");
  const wider = (hex + fnv1aSuffix(publicKey)).slice(0, 20);
  return wider.match(/.{4}/g)!.join(" ");
}

function fnv1aSuffix(input: string): string {
  let hash = 0xcbf29ce4;
  for (let i = input.length - 1; i >= 0; i--) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function randomBase64(bytes: number): string {
  const buf = new Uint8Array(bytes);
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => void } };
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  // Browser-safe base64 encode (no Buffer).
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return typeof btoa === "function"
    ? btoa(bin).replace(/=+$/, "")
    : Buffer.from(buf).toString("base64").replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Live transcript redaction
// ---------------------------------------------------------------------------

/**
 * Personal-data patterns we mask before the line is shown to the
 * clinician or persisted. Order matters: longer / more specific
 * patterns run first so they aren't eaten by the generic phone or
 * credit-card matchers.
 */
const PHI_PATTERNS: Array<{ name: PhiCategory; pattern: RegExp; mask: string }> = [
  { name: "ssn", pattern: /\b\d{3}-\d{2}-\d{4}\b/g, mask: "[SSN ▮▮▮▮▮]" },
  {
    name: "credit_card",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    mask: "[CARD ▮▮▮▮ ▮▮▮▮]",
  },
  {
    name: "address",
    pattern:
      /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b/gi,
    mask: "[ADDRESS REDACTED]",
  },
  {
    name: "email",
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
    mask: "[EMAIL REDACTED]",
  },
  {
    name: "phone",
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    mask: "[PHONE REDACTED]",
  },
  {
    name: "dob",
    pattern: /\b(?:0?[1-9]|1[0-2])[\/-](?:0?[1-9]|[12]\d|3[01])[\/-](?:19|20)\d{2}\b/g,
    mask: "[DOB REDACTED]",
  },
];

export type PhiCategory =
  | "ssn"
  | "credit_card"
  | "address"
  | "email"
  | "phone"
  | "dob";

/**
 * Words that should never be scrubbed — clinical symptoms, common
 * cannabis-medication signals, and care-plan verbs. Kept lowercase so
 * the matcher only needs one casefold per line.
 */
export const CLINICAL_SIGNALS = [
  "pain",
  "anxiety",
  "sleep",
  "nausea",
  "headache",
  "appetite",
  "spasm",
  "tremor",
  "fatigue",
  "seizure",
  "dose",
  "titrate",
  "refill",
  "thc",
  "cbd",
  "tincture",
  "edible",
  "vape",
  "gummy",
  "ratio",
  "mg",
  "ml",
];

/**
 * Billing-code shapes worth surfacing as "keep" hits in the redacted
 * line — ICD-10, CPT, HCPCS. We only need to recognise them, not
 * validate the code is real.
 */
const BILLING_CODE_PATTERNS: Array<{ kind: BillingCodeKind; pattern: RegExp }> = [
  { kind: "icd10", pattern: /\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b/g },
  { kind: "cpt", pattern: /\b\d{5}\b/g },
  { kind: "hcpcs", pattern: /\b[A-CEGHJ-MOPQRSTV]\d{4}\b/g },
];

export type BillingCodeKind = "icd10" | "cpt" | "hcpcs";

export interface RedactedTranscriptLine {
  /** The raw model-generated line as received from the transcriber. */
  original: string;
  /** Same line with PHI matches replaced by category masks. */
  redacted: string;
  /** Categories of PHI we masked, deduped, in masking order. */
  redactedCategories: PhiCategory[];
  /** Clinical keywords kept verbatim in the redacted line. */
  preservedClinicalTerms: string[];
  /** Billing codes detected in the redacted line. */
  preservedBillingCodes: Array<{ kind: BillingCodeKind; code: string }>;
  /** True when the line has any clinical signal — used to gate the chart-ready list. */
  isClinicallyRelevant: boolean;
}

/**
 * Strip personal data from a single transcript line in real time.
 *
 * Designed to be called on every transcriber chunk, so it must be
 * cheap, allocation-light, and idempotent on already-redacted text.
 */
export function redactTranscriptLine(raw: string): RedactedTranscriptLine {
  if (!raw || !raw.trim()) {
    return {
      original: raw,
      redacted: raw,
      redactedCategories: [],
      preservedClinicalTerms: [],
      preservedBillingCodes: [],
      isClinicallyRelevant: false,
    };
  }

  let redacted = raw;
  const categories: PhiCategory[] = [];

  for (const { name, pattern, mask } of PHI_PATTERNS) {
    // Global regexes carry state across .test/.exec calls — always
    // reset before reuse or matches will silently skip.
    pattern.lastIndex = 0;
    if (pattern.test(redacted)) {
      pattern.lastIndex = 0;
      redacted = redacted.replace(pattern, mask);
      categories.push(name);
    }
  }

  const lower = redacted.toLowerCase();
  const preservedClinicalTerms = CLINICAL_SIGNALS.filter((kw) =>
    lower.includes(kw),
  );

  const preservedBillingCodes: Array<{ kind: BillingCodeKind; code: string }> = [];
  for (const { kind, pattern } of BILLING_CODE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = redacted.match(pattern);
    if (matches) {
      for (const code of matches) {
        // CPT codes are bare 5-digit numbers; avoid double-counting
        // when they overlap with already-masked phone/credit chunks.
        if (!preservedBillingCodes.some((b) => b.code === code)) {
          preservedBillingCodes.push({ kind, code });
        }
      }
    }
  }

  const isClinicallyRelevant =
    preservedClinicalTerms.length > 0 || preservedBillingCodes.length > 0;

  return {
    original: raw,
    redacted,
    redactedCategories: dedupe(categories),
    preservedClinicalTerms,
    preservedBillingCodes,
    isClinicallyRelevant,
  };
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

// ---------------------------------------------------------------------------
// End-of-call AI summarization
// ---------------------------------------------------------------------------

export interface CallSummary extends RedactionResult {
  lineCount: number;
  redactedLineCount: number;
  billingCodes: Array<{ kind: BillingCodeKind; code: string }>;
}

/**
 * Aggregate the per-line redaction state into the chart-ready summary
 * we hand off to the existing transcript review queue.
 */
export function summarizePhoneCallTranscript(
  lines: Array<RedactedTranscriptLine | string>,
): CallSummary {
  const normalized = lines.map((l) =>
    typeof l === "string" ? redactTranscriptLine(l) : l,
  );

  const fullText = normalized.map((l) => l.redacted).join(" ");
  const aggregate = redactToPertinentSummary(fullText);

  const billing: Array<{ kind: BillingCodeKind; code: string }> = [];
  for (const line of normalized) {
    for (const code of line.preservedBillingCodes) {
      if (!billing.some((b) => b.code === code.code)) billing.push(code);
    }
  }

  return {
    ...aggregate,
    lineCount: normalized.length,
    redactedLineCount: normalized.filter((l) => l.redactedCategories.length > 0)
      .length,
    billingCodes: billing,
  };
}
