import { describe, expect, it } from "vitest";

import {
  chooseChallengeMode,
  verifyCheckInIdentity,
  type IdentityExpectation,
} from "./identity-challenge";

const DOB = "1985-04-12";

const withPhone: IdentityExpectation = {
  dateOfBirth: DOB,
  lastName: "Rivers",
  smsCode: "418293",
  hasPhone: true,
};

const withoutPhone: IdentityExpectation = {
  dateOfBirth: DOB,
  lastName: "Rivers",
  smsCode: null,
  hasPhone: false,
};

describe("chooseChallengeMode", () => {
  it("prefers DOB + SMS code when a phone is on file and a code was issued", () => {
    expect(chooseChallengeMode(withPhone)).toBe("dob_sms");
  });

  it("falls back to DOB + last name (front-desk assisted) without a phone", () => {
    expect(chooseChallengeMode(withoutPhone)).toBe("dob_lastname");
  });

  it("falls back to last name when a phone exists but no code was issued yet", () => {
    expect(chooseChallengeMode({ ...withPhone, smsCode: null })).toBe("dob_lastname");
  });
});

describe("verifyCheckInIdentity", () => {
  it("accepts a correct DOB + SMS code", () => {
    const r = verifyCheckInIdentity(withPhone, { dateOfBirth: DOB, smsCode: "418293" });
    expect(r).toMatchObject({ ok: true, mode: "dob_sms" });
  });

  it("rejects a wrong SMS code even with correct DOB", () => {
    const r = verifyCheckInIdentity(withPhone, { dateOfBirth: DOB, smsCode: "000000" });
    expect(r.ok).toBe(false);
  });

  it("does NOT accept the last-name fallback when a phone+code exist (must use SMS)", () => {
    const r = verifyCheckInIdentity(withPhone, { dateOfBirth: DOB, lastName: "Rivers" });
    expect(r.ok).toBe(false);
  });

  it("accepts DOB + last name when no phone is on file (assisted path)", () => {
    const r = verifyCheckInIdentity(withoutPhone, { dateOfBirth: DOB, lastName: "rivers" });
    expect(r).toMatchObject({ ok: true, mode: "dob_lastname" });
  });

  it("rejects a wrong DOB regardless of the second factor", () => {
    expect(verifyCheckInIdentity(withoutPhone, { dateOfBirth: "1990-01-01", lastName: "Rivers" }).ok).toBe(false);
    expect(verifyCheckInIdentity(withPhone, { dateOfBirth: "1990-01-01", smsCode: "418293" }).ok).toBe(false);
  });

  it("is case- and whitespace-insensitive for last name", () => {
    const r = verifyCheckInIdentity(withoutPhone, { dateOfBirth: DOB, lastName: "  RIVERS " });
    expect(r.ok).toBe(true);
  });

  it("rejects an empty attempt", () => {
    expect(verifyCheckInIdentity(withoutPhone, {}).ok).toBe(false);
    expect(verifyCheckInIdentity(withPhone, {}).ok).toBe(false);
  });
});
