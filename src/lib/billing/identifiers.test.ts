import { describe, expect, it, beforeAll } from "vitest";
import {
  decryptTaxId,
  einPrefixIsPlausible,
  encryptTaxId,
  isValidEin,
  isValidNpi,
  isValidTaxonomy,
  normalizeEin,
  normalizeNpi,
  parseBillingAddress,
  resolveBillingIdentifiers,
  scrapeNpiFromBio,
} from "./identifiers";
import { parseProviderNpiCsv } from "./identifiers-db";
import { randomBytes } from "crypto";

// EMR-220 — pure helpers + 3-tier resolver

beforeAll(() => {
  // Set a deterministic master key so encrypt/decrypt round-trip is testable.
  process.env.BILLING_SECRET_KEY = randomBytes(32).toString("hex");
});

describe("isValidNpi (CMS Luhn)", () => {
  it("accepts CMS reference NPIs", () => {
    // CMS NPPES "NPI Check Digit Calculation" white paper test vector
    expect(isValidNpi("1234567893")).toBe(true);
  });

  it("rejects bad checksums", () => {
    expect(isValidNpi("1234567890")).toBe(false);
    expect(isValidNpi("0000000000")).toBe(false);
  });

  it("handles formatting / null", () => {
    expect(isValidNpi(null)).toBe(false);
    expect(isValidNpi("")).toBe(false);
    expect(isValidNpi("123-456-789-3")).toBe(true); // strip non-digits
    expect(isValidNpi("12345")).toBe(false); // wrong length
  });
});

describe("isValidTaxonomy", () => {
  it("accepts a 10-char NUCC taxonomy code", () => {
    expect(isValidTaxonomy("207RI0008X")).toBe(true);
    expect(isValidTaxonomy("2084P0800X")).toBe(true);
    expect(isValidTaxonomy("207ri0008x")).toBe(true); // case-insensitive
  });
  it("rejects wrong length / charset / null", () => {
    expect(isValidTaxonomy(null)).toBe(false);
    expect(isValidTaxonomy("")).toBe(false);
    expect(isValidTaxonomy("207RI0008")).toBe(false); // 9 chars
    expect(isValidTaxonomy("207RI0008XX")).toBe(false); // 11 chars
    expect(isValidTaxonomy("207-I0008X")).toBe(false); // hyphen
  });
});

describe("isValidEin", () => {
  it("requires the NN-NNNNNNN format", () => {
    expect(isValidEin("12-3456789")).toBe(true);
    expect(isValidEin("12 3456789")).toBe(false);
    expect(isValidEin("123456789")).toBe(false);
    expect(isValidEin(null)).toBe(false);
  });
});

describe("normalizeEin", () => {
  it("strips the hyphen and any non-digits", () => {
    expect(normalizeEin("12-3456789")).toBe("123456789");
    expect(normalizeEin("12.3456789")).toBe("123456789");
  });
});

describe("einPrefixIsPlausible", () => {
  it("flags never-issued IRS prefixes", () => {
    expect(einPrefixIsPlausible("00-1234567")).toBe(false);
    expect(einPrefixIsPlausible("89-1234567")).toBe(false);
  });
  it("accepts in-use prefixes", () => {
    expect(einPrefixIsPlausible("12-3456789")).toBe(true);
    expect(einPrefixIsPlausible("46-1234567")).toBe(true);
  });
});

describe("parseProviderNpiCsv", () => {
  it("parses valid rows + flags malformed NPIs", () => {
    const csv = [
      "provider_id,npi,taxonomy_code",
      "p1,1234567893,207RI0008X",
      "p2,1234567890,",
      ",1932456783,",
    ].join("\n");
    const r = parseProviderNpiCsv(csv);
    expect(r.rows).toEqual([{ providerId: "p1", npi: "1234567893", taxonomyCode: "207RI0008X" }]);
    expect(r.errors.length).toBe(2);
  });

  it("requires the header row", () => {
    const r = parseProviderNpiCsv("p1,123,456");
    expect(r.errors[0].message).toContain("provider_id, npi");
  });
});

describe("encrypt/decrypt round trip", () => {
  it("recovers the plaintext", () => {
    const ct = encryptTaxId("12-3456789");
    expect(ct).not.toBe("12-3456789");
    expect(decryptTaxId(ct)).toBe("12-3456789");
  });

  it("rejects tampered ciphertext", () => {
    const ct = encryptTaxId("12-3456789");
    const buf = Buffer.from(ct, "base64");
    buf[buf.length - 1] = (buf[buf.length - 1] + 1) % 256;
    const tampered = buf.toString("base64");
    expect(() => decryptTaxId(tampered)).toThrow();
  });
});

describe("parseBillingAddress", () => {
  it("normalizes state and postal code", () => {
    const out = parseBillingAddress({
      line1: "1 Main",
      city: "Boston",
      state: "ma",
      postalCode: "02110-1234",
    });
    expect(out?.state).toBe("MA");
    expect(out?.postalCode).toBe("021101234");
  });

  it("returns null on missing fields", () => {
    expect(parseBillingAddress({ line1: "1 Main" })).toBeNull();
    expect(parseBillingAddress(null)).toBeNull();
  });
});

describe("scrapeNpiFromBio", () => {
  it("finds a labelled valid NPI", () => {
    expect(scrapeNpiFromBio("Dr. Patel, NPI: 1234567893, board certified...")).toBe("1234567893");
  });
  it("rejects bio NPIs that fail Luhn", () => {
    expect(scrapeNpiFromBio("NPI 1234567890")).toBeNull();
  });
});

describe("resolveBillingIdentifiers — three-tier cascade", () => {
  const baseOrg = {
    id: "org-1",
    billingNpi: null,
    taxId: null,
    billingAddress: null,
    payToAddress: null,
  };

  it("prefers DB billing NPI", () => {
    const r = resolveBillingIdentifiers({
      organization: {
        ...baseOrg,
        billingNpi: "1234567893",
        billingAddress: { line1: "1 A St", city: "Boston", state: "MA", postalCode: "02110" },
      },
      provider: null,
      env: () => ({}),
    });
    expect(r.billingNpi).toBe("1234567893");
    expect(r.source.billingNpi).toBe("db");
    expect(r.degraded).toBe(true); // missing tax ID flips degraded
  });

  it("falls back to env NPI when DB is empty", () => {
    const r = resolveBillingIdentifiers({
      organization: baseOrg,
      provider: null,
      env: () => ({
        BILLING_PROVIDER_NPI: "1234567893",
        BILLING_ADDRESS_JSON: JSON.stringify({ line1: "1 A St", city: "Boston", state: "MA", postalCode: "02110" }),
      }),
    });
    expect(r.billingNpi).toBe("1234567893");
    expect(r.source.billingNpi).toBe("env");
    expect(r.source.address).toBe("env");
  });

  it("scrapes provider bio as last resort", () => {
    const r = resolveBillingIdentifiers({
      organization: baseOrg,
      provider: { id: "p1", npi: null, taxonomyCode: null, bio: "Dr. Patel, NPI: 1234567893" },
      env: () => ({
        BILLING_ADDRESS_JSON: JSON.stringify({ line1: "1 A St", city: "Boston", state: "MA", postalCode: "02110" }),
      }),
    });
    expect(r.billingNpi).toBe("1234567893");
    expect(r.source.billingNpi).toBe("bio_scrape");
  });

  it("throws when no NPI is available anywhere", () => {
    expect(() =>
      resolveBillingIdentifiers({
        organization: baseOrg,
        provider: null,
        env: () => ({}),
      }),
    ).toThrow(/No valid billing NPI/);
  });

  it("throws when no address is available", () => {
    expect(() =>
      resolveBillingIdentifiers({
        organization: { ...baseOrg, billingNpi: "1234567893" },
        provider: null,
        env: () => ({}),
      }),
    ).toThrow(/No valid billing address/);
  });
});

describe("normalizeNpi", () => {
  it("strips formatting and caps at 10 digits", () => {
    expect(normalizeNpi("123-456-7893")).toBe("1234567893");
    expect(normalizeNpi("12345678931234")).toBe("1234567893");
  });
});
