import { describe, expect, it } from "vitest";

import {
  evaluateOtpVerification,
  generateOtpCode,
  hashOtp,
  hashesEqual,
  isIssueRateLimited,
  type OtpRecordState,
} from "./otp";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function record(overrides: Partial<OtpRecordState> = {}): OtpRecordState {
  return {
    codeHash: hashOtp("123456"),
    salt: null,
    expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000), // 5 min out
    attempts: 0,
    maxAttempts: 5,
    consumedAt: null,
    ...overrides,
  };
}

describe("generateOtpCode", () => {
  it("produces a zero-padded numeric code of the requested length", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashOtp / hashesEqual", () => {
  it("hashes deterministically and ignores surrounding whitespace", () => {
    expect(hashOtp("123456")).toBe(hashOtp(" 123456 "));
  });
  it("matches equal hashes and rejects different / empty ones", () => {
    expect(hashesEqual(hashOtp("123456"), hashOtp("123456"))).toBe(true);
    expect(hashesEqual(hashOtp("123456"), hashOtp("000000"))).toBe(false);
    expect(hashesEqual("", "")).toBe(false);
  });
});

describe("evaluateOtpVerification", () => {
  it("fails with no_active_code when there is no record", () => {
    expect(evaluateOtpVerification(null, "123456", NOW)).toEqual({
      ok: false,
      reason: "no_active_code",
    });
  });

  it("accepts the correct code on a fresh, unconsumed record", () => {
    expect(evaluateOtpVerification(record(), "123456", NOW)).toEqual({
      ok: true,
      reason: "ok",
    });
  });

  it("rejects an incorrect code as mismatch", () => {
    expect(evaluateOtpVerification(record(), "000000", NOW).reason).toBe("mismatch");
  });

  it("rejects an already-consumed code before comparing", () => {
    const r = record({ consumedAt: new Date(NOW.getTime() - 1000) });
    // Even with the *correct* code, a consumed record never succeeds.
    expect(evaluateOtpVerification(r, "123456", NOW)).toEqual({
      ok: false,
      reason: "already_consumed",
    });
  });

  it("rejects an expired code before comparing", () => {
    const r = record({ expiresAt: new Date(NOW.getTime() - 1) });
    expect(evaluateOtpVerification(r, "123456", NOW)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("locks out once attempts have reached the max, even with the right code", () => {
    const r = record({ attempts: 5, maxAttempts: 5 });
    expect(evaluateOtpVerification(r, "123456", NOW)).toEqual({
      ok: false,
      reason: "too_many_attempts",
    });
  });

  it("precedence: consumed beats expired beats lockout beats mismatch", () => {
    const r = record({
      consumedAt: new Date(NOW.getTime() - 1000),
      expiresAt: new Date(NOW.getTime() - 1000),
      attempts: 99,
    });
    expect(evaluateOtpVerification(r, "000000", NOW).reason).toBe("already_consumed");
  });
});

describe("isIssueRateLimited", () => {
  it("blocks once the recent count reaches the max", () => {
    expect(isIssueRateLimited(2, 3)).toBe(false);
    expect(isIssueRateLimited(3, 3)).toBe(true);
    expect(isIssueRateLimited(4, 3)).toBe(true);
  });
});
