// EMR-220 — Production billing identifiers
// ----------------------------------------
// Single source of truth for resolving the (billingNpi, taxId, renderingNpi,
// taxonomyCode, billingAddress, payToAddress) tuple that gets stamped onto
// every 837P submission. Three-tier resolution per the ticket:
//   1. DB (Organization / Provider rows) — canonical
//   2. Environment variables — practice-wide fallback for staging / dev
//   3. Provider.bio free-text scrape — last-ditch legacy path; logged as
//      "degraded" so an admin sees it on the daily-close report

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// NPI validation — CMS Luhn variant ("80840" prefix added before mod-10)
// ---------------------------------------------------------------------------

const NPI_PREFIX = "80840" as const;

/** True iff the given string is a structurally valid 10-digit NPI. */
export function isValidNpi(npi: string | null | undefined): boolean {
  if (!npi) return false;
  const cleaned = npi.replace(/\D/g, "");
  if (cleaned.length !== 10) return false;

  const withPrefix = NPI_PREFIX + cleaned.slice(0, 9);
  const checkDigit = Number(cleaned[9]);

  let sum = 0;
  let doubleIt = true;
  for (let i = withPrefix.length - 1; i >= 0; i--) {
    const d = Number(withPrefix[i]);
    if (Number.isNaN(d)) return false;
    const v = doubleIt ? d * 2 : d;
    sum += v >= 10 ? v - 9 : v;
    doubleIt = !doubleIt;
  }
  const computedCheck = (10 - (sum % 10)) % 10;
  return computedCheck === checkDigit;
}

/** Healthcare Provider Taxonomy Code — 10 alphanumeric chars (NUCC code set,
 *  e.g. "207RI0008X"). Used in the 837P PRV segment. Validation is structural
 *  (length + charset); we don't ship the full NUCC dictionary. */
export function isValidTaxonomy(code: string | null | undefined): boolean {
  if (!code) return false;
  return /^[0-9A-Z]{10}$/.test(code.trim().toUpperCase());
}

/** EIN format: NN-NNNNNNN (9 digits with hyphen at position 2). */
export function isValidEin(ein: string | null | undefined): boolean {
  if (!ein) return false;
  return /^\d{2}-\d{7}$/.test(ein);
}

/** Strip an EIN to 9 digits for X12 REF*EI (no hyphen allowed in 5010). */
export function normalizeEin(ein: string): string {
  return ein.replace(/\D/g, "").slice(0, 9);
}

/** First-pass IRS prefix sanity check. The IRS publishes a list of 2-digit
 *  campus prefixes that are actually issued; everything else (e.g. "00",
 *  "08", "09", "17", "18") is provably invalid. We don't ship the full
 *  exhaustive list — just the obvious "never issued" prefixes — so this
 *  is a *negative* check (only flags definite invalids). */
const NEVER_ISSUED_EIN_PREFIXES = new Set([
  "00", "07", "08", "09", "17", "18", "19", "28", "29", "49", "69", "70",
  "78", "79", "89",
]);

export function einPrefixIsPlausible(ein: string): boolean {
  const digits = normalizeEin(ein);
  if (digits.length !== 9) return false;
  return !NEVER_ISSUED_EIN_PREFIXES.has(digits.slice(0, 2));
}

/** Normalize an NPI into a 10-digit no-punctuation string ready for EDI. */
export function normalizeNpi(npi: string): string {
  return npi.replace(/\D/g, "").slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tax ID encryption — AES-256-GCM, master key from env
// ---------------------------------------------------------------------------

const ALGO = "aes-256-gcm" as const;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getMasterKey(): Buffer {
  const hex = process.env.BILLING_SECRET_KEY ?? process.env.DOCUMENT_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "BILLING_SECRET_KEY (or DOCUMENT_ENCRYPTION_KEY) env var required for tax ID encryption",
    );
  }
  if (hex.length !== 64) {
    throw new Error(`BILLING_SECRET_KEY must be 64 hex chars (got ${hex.length})`);
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt a tax ID for at-rest storage. base64(iv || tag || ciphertext). */
export function encryptTaxId(plaintext: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptTaxId(blobB64: string): string {
  const key = getMasterKey();
  const blob = Buffer.from(blobB64, "base64");
  if (blob.length < IV_BYTES + TAG_BYTES) {
    throw new Error("Tax ID ciphertext is malformed (too short)");
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Address shape
// ---------------------------------------------------------------------------

export interface BillingAddress {
  line1: string;
  line2?: string | null;
  city: string;
  state: string; // 2-letter
  postalCode: string; // 5 or 9 digits
}

/** Coerce a raw JSON value into a BillingAddress, returning null when the
 *  shape is missing required fields. */
export function parseBillingAddress(raw: unknown): BillingAddress | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.line1 !== "string" || r.line1.length === 0) return null;
  if (typeof r.city !== "string" || r.city.length === 0) return null;
  if (typeof r.state !== "string" || r.state.length !== 2) return null;
  if (typeof r.postalCode !== "string" || r.postalCode.length === 0) return null;
  return {
    line1: r.line1,
    line2: typeof r.line2 === "string" ? r.line2 : null,
    city: r.city,
    state: r.state.toUpperCase(),
    postalCode: r.postalCode.replace(/\D/g, ""),
  };
}

// ---------------------------------------------------------------------------
// Resolver — three-tier cascade
// ---------------------------------------------------------------------------

export interface ResolvedBillingIdentifiers {
  billingNpi: string;
  renderingNpi: string;
  taxId: string;
  taxonomyCode: string | null;
  billingAddress: BillingAddress;
  payToAddress: BillingAddress | null;
  source: {
    billingNpi: "db" | "env" | "bio_scrape";
    taxId: "db" | "env" | "missing";
    address: "db" | "env" | "missing";
  };
  /** True when any field came from a non-DB source. The clearinghouse agent
   *  surfaces this on the submission ledger so operations can backfill. */
  degraded: boolean;
}

export interface ResolveBillingIdentifiersInput {
  organization: {
    id: string;
    billingNpi: string | null;
    taxId: string | null;
    billingAddress: unknown;
    payToAddress: unknown;
  };
  provider: {
    id: string;
    npi: string | null;
    taxonomyCode: string | null;
    bio: string | null;
  } | null;
  env?: () => Record<string, string | undefined>;
  decrypt?: (blob: string) => string;
}

const NPI_BIO_REGEX = /\bNPI[:\s#]*([0-9]{10})\b/i;

/** Pull an NPI out of free-form provider bio text. Last-resort path. */
export function scrapeNpiFromBio(bio: string | null | undefined): string | null {
  if (!bio) return null;
  const m = bio.match(NPI_BIO_REGEX);
  if (!m) return null;
  const candidate = m[1];
  return isValidNpi(candidate) ? candidate : null;
}

/** Resolve the billing tuple for a claim. Throws when no valid billing NPI
 *  can be found anywhere — that's a hard fail because submission requires it. */
export function resolveBillingIdentifiers(
  args: ResolveBillingIdentifiersInput,
): ResolvedBillingIdentifiers {
  const env = (args.env ?? (() => process.env))();
  const decrypt = args.decrypt ?? decryptTaxId;

  // ── billing NPI ─────────────────────────────────────────────────
  let billingNpi: string | null = null;
  let billingNpiSource: ResolvedBillingIdentifiers["source"]["billingNpi"] = "db";
  if (args.organization.billingNpi && isValidNpi(args.organization.billingNpi)) {
    billingNpi = normalizeNpi(args.organization.billingNpi);
  } else if (env.BILLING_PROVIDER_NPI && isValidNpi(env.BILLING_PROVIDER_NPI)) {
    billingNpi = normalizeNpi(env.BILLING_PROVIDER_NPI);
    billingNpiSource = "env";
  } else {
    const scraped = scrapeNpiFromBio(args.provider?.bio);
    if (scraped) {
      billingNpi = scraped;
      billingNpiSource = "bio_scrape";
    }
  }
  if (!billingNpi) {
    throw new Error(
      `No valid billing NPI for organization ${args.organization.id}. ` +
        `Set Organization.billingNpi or BILLING_PROVIDER_NPI env var.`,
    );
  }

  // ── rendering NPI (provider-level, falls back to billing) ────────
  let renderingNpi = billingNpi;
  if (args.provider?.npi && isValidNpi(args.provider.npi)) {
    renderingNpi = normalizeNpi(args.provider.npi);
  } else if (args.provider) {
    const scraped = scrapeNpiFromBio(args.provider.bio);
    if (scraped) renderingNpi = scraped;
  }

  // ── tax ID ────────────────────────────────────────────────────────
  let taxId = "";
  let taxIdSource: ResolvedBillingIdentifiers["source"]["taxId"] = "missing";
  if (args.organization.taxId) {
    try {
      taxId = decrypt(args.organization.taxId);
      taxIdSource = "db";
    } catch {
      // fall through to env
    }
  }
  if (!taxId && env.BILLING_TAX_ID && isValidEin(env.BILLING_TAX_ID)) {
    taxId = env.BILLING_TAX_ID;
    taxIdSource = "env";
  }

  // ── address ──────────────────────────────────────────────────────
  let billingAddress = parseBillingAddress(args.organization.billingAddress);
  let addressSource: ResolvedBillingIdentifiers["source"]["address"] = "db";
  if (!billingAddress && env.BILLING_ADDRESS_JSON) {
    try {
      billingAddress = parseBillingAddress(JSON.parse(env.BILLING_ADDRESS_JSON));
      if (billingAddress) addressSource = "env";
    } catch {
      // ignore
    }
  }
  if (!billingAddress) {
    throw new Error(
      `No valid billing address for organization ${args.organization.id}. ` +
        `Set Organization.billingAddress or BILLING_ADDRESS_JSON env var.`,
    );
  }

  const payToAddress = parseBillingAddress(args.organization.payToAddress);

  const degraded =
    billingNpiSource !== "db" ||
    taxIdSource !== "db" ||
    addressSource !== "db";

  return {
    billingNpi,
    renderingNpi,
    taxId,
    taxonomyCode: args.provider?.taxonomyCode ?? null,
    billingAddress,
    payToAddress,
    source: {
      billingNpi: billingNpiSource,
      taxId: taxIdSource,
      address: addressSource,
    },
    degraded,
  };
}
