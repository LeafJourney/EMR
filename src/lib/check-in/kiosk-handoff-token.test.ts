import { describe, expect, it } from "vitest";

import {
  createKioskHandoffToken,
  hashKioskHandoffToken,
  parseKioskHandoffToken,
  verifyKioskHandoffToken,
  type KioskHandoffVerifyContext,
} from "./kiosk-handoff-token";

const SECRET = "test-secret-key";
const NOW = new Date("2026-06-01T12:00:00.000Z");

function mint(overrides: Partial<{ patientId: string; organizationId: string; expiresAt: Date }> = {}) {
  return createKioskHandoffToken({
    patientId: overrides.patientId ?? "pat_1",
    organizationId: overrides.organizationId ?? "org_1",
    expiresAt: overrides.expiresAt ?? new Date(NOW.getTime() + 10 * 60 * 1000),
    secret: SECRET,
    nonce: "nonce-abc",
  });
}

function ctx(t: ReturnType<typeof mint>, overrides: Partial<KioskHandoffVerifyContext> = {}): KioskHandoffVerifyContext {
  return {
    secret: SECRET,
    now: NOW,
    storedTokenHash: t.tokenHash,
    redeemedAt: null,
    expectedPatientId: "pat_1",
    expectedOrganizationId: "org_1",
    ...overrides,
  };
}

describe("createKioskHandoffToken", () => {
  it("carries no PHI — only opaque ids, expiry, nonce, purpose", () => {
    const t = mint();
    expect(t.payload.purpose).toBe("kiosk_handoff");
    // token body decodes to the payload; assert no name/dob-ish fields exist
    expect(JSON.stringify(t.payload)).not.toMatch(/name|dob|birth|phone|email/i);
    expect(t.tokenHash).toBe(hashKioskHandoffToken(t.token));
  });
});

describe("parseKioskHandoffToken", () => {
  it("round-trips a valid token", () => {
    const t = mint();
    expect(parseKioskHandoffToken(t.token, SECRET)?.patientId).toBe("pat_1");
  });
  it("rejects a token signed with a different secret", () => {
    const t = mint();
    expect(parseKioskHandoffToken(t.token, "wrong-secret")).toBeNull();
  });
  it("rejects a tampered body", () => {
    const t = mint();
    const [, sig] = t.token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ patientId: "pat_HACK", organizationId: "org_1", exp: NOW.getTime() + 1e6, nonce: "n", purpose: "kiosk_handoff" })).toString("base64url");
    expect(parseKioskHandoffToken(`${forgedBody}.${sig}`, SECRET)).toBeNull();
  });
});

describe("verifyKioskHandoffToken", () => {
  it("accepts a fresh, unredeemed, matching token", () => {
    const t = mint();
    expect(verifyKioskHandoffToken(t.token, ctx(t))).toEqual({ valid: true, payload: t.payload });
  });

  it("rejects an unknown token (stored hash mismatch / rotated)", () => {
    const t = mint();
    const res = verifyKioskHandoffToken(t.token, ctx(t, { storedTokenHash: "deadbeef" }));
    expect(res.reason).toBe("unknown_token");
  });

  it("rejects when the token's patient/org doesn't match the row it was found on", () => {
    const t = mint();
    expect(verifyKioskHandoffToken(t.token, ctx(t, { expectedPatientId: "pat_OTHER" })).reason).toBe("relationship_mismatch");
    expect(verifyKioskHandoffToken(t.token, ctx(t, { expectedOrganizationId: "org_OTHER" })).reason).toBe("relationship_mismatch");
  });

  it("rejects an already-redeemed token (single use)", () => {
    const t = mint();
    expect(verifyKioskHandoffToken(t.token, ctx(t, { redeemedAt: new Date(NOW.getTime() - 1000) })).reason).toBe("already_redeemed");
  });

  it("rejects an expired token", () => {
    const t = mint({ expiresAt: new Date(NOW.getTime() - 1) });
    expect(verifyKioskHandoffToken(t.token, ctx(t)).reason).toBe("expired");
  });

  it("rejects a forged signature before anything else", () => {
    const t = mint();
    expect(verifyKioskHandoffToken(`${t.token}x`, ctx(t)).reason).toBe("invalid_signature");
  });
});
