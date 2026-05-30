import { describe, expect, it } from "vitest";

import {
  createCheckInToken,
  hashCheckInToken,
  parseCheckInToken,
  verifyCheckInToken,
  type CheckInVerifyContext,
} from "./qr-token";

const SECRET = "test-secret-do-not-use-in-prod";
const APPT = "appt_abc";
const PATIENT = "pat_xyz";

const NOW = new Date("2026-06-01T15:00:00.000Z");
const STARTS_AT = new Date("2026-06-01T15:30:00.000Z");
const ENDS_AT = new Date("2026-06-01T16:00:00.000Z");
const EXPIRES_AT = new Date("2026-06-01T16:30:00.000Z");

function makeToken() {
  return createCheckInToken({
    appointmentId: APPT,
    patientId: PATIENT,
    expiresAt: EXPIRES_AT,
    secret: SECRET,
    nonce: "nonce-1",
  });
}

function ctx(overrides: Partial<CheckInVerifyContext> = {}): CheckInVerifyContext {
  return {
    secret: SECRET,
    now: NOW,
    appointment: {
      id: APPT,
      patientId: PATIENT,
      status: "confirmed",
      startAt: STARTS_AT,
      endAt: ENDS_AT,
    },
    storedTokenHash: hashCheckInToken(makeToken().token),
    redeemedAt: null,
    ...overrides,
  };
}

describe("createCheckInToken", () => {
  it("produces an opaque token with no PHI and a separate storage hash", () => {
    const { token, tokenHash, payload } = makeToken();
    expect(token).not.toMatch(/1985|jordan|rivers|dob/i);
    expect(tokenHash).not.toEqual(token);
    expect(tokenHash).toEqual(hashCheckInToken(token));
    expect(payload.appointmentId).toBe(APPT);
    expect(payload.patientId).toBe(PATIENT);
    expect(payload.purpose).toBe("qr_rescue");
  });

  it("is deterministic for identical inputs so the stored hash matches", () => {
    const a = makeToken();
    const b = makeToken();
    expect(a.token).toEqual(b.token);
    expect(a.tokenHash).toEqual(b.tokenHash);
  });
});

describe("parseCheckInToken", () => {
  it("rejects a token signed with a different secret", () => {
    expect(parseCheckInToken(makeToken().token, "wrong-secret")).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const { token } = makeToken();
    const [body, sig] = token.split(".");
    expect(parseCheckInToken(`${body}x.${sig}`, SECRET)).toBeNull();
  });

  it("round-trips a valid token to its payload", () => {
    const { token, payload } = makeToken();
    expect(parseCheckInToken(token, SECRET)).toEqual(payload);
  });
});

describe("verifyCheckInToken", () => {
  it("accepts a valid, unredeemed, in-window token", () => {
    const r = verifyCheckInToken(makeToken().token, ctx());
    expect(r.valid).toBe(true);
    expect(r.reason).toBeUndefined();
  });

  it("rejects a bad signature", () => {
    const r = verifyCheckInToken(makeToken().token, ctx({ secret: "nope" }));
    expect(r).toMatchObject({ valid: false, reason: "invalid_signature" });
  });

  it("rejects an expired token", () => {
    const r = verifyCheckInToken(
      makeToken().token,
      ctx({ now: new Date(EXPIRES_AT.getTime() + 1000) }),
    );
    expect(r).toMatchObject({ valid: false, reason: "expired" });
  });

  it("rejects when the stored hash does not match (rotated/revoked)", () => {
    const r = verifyCheckInToken(makeToken().token, ctx({ storedTokenHash: "deadbeef" }));
    expect(r).toMatchObject({ valid: false, reason: "unknown_token" });
  });

  it("rejects when the token patient != appointment patient", () => {
    const c = ctx();
    c.appointment.patientId = "someone_else";
    const r = verifyCheckInToken(makeToken().token, c);
    expect(r).toMatchObject({ valid: false, reason: "relationship_mismatch" });
  });

  it("rejects a non-checkinable appointment status", () => {
    for (const status of ["cancelled", "completed", "no_show"]) {
      const r = verifyCheckInToken(
        makeToken().token,
        ctx({
          appointment: { id: APPT, patientId: PATIENT, status, startAt: STARTS_AT, endAt: ENDS_AT },
        }),
      );
      expect(r, `status ${status}`).toMatchObject({
        valid: false,
        reason: "appointment_not_checkinable",
      });
    }
  });

  it("rejects when outside the appointment check-in window (too early)", () => {
    const r = verifyCheckInToken(
      makeToken().token,
      ctx({ now: new Date(STARTS_AT.getTime() - 3 * 60 * 60 * 1000) }),
    );
    expect(r).toMatchObject({ valid: false, reason: "outside_window" });
  });

  it("rejects an already-redeemed token", () => {
    const r = verifyCheckInToken(
      makeToken().token,
      ctx({ redeemedAt: new Date(NOW.getTime() - 60_000) }),
    );
    expect(r).toMatchObject({ valid: false, reason: "already_redeemed" });
  });

  it("accepts within the early window (default 60m before start)", () => {
    const r = verifyCheckInToken(
      makeToken().token,
      ctx({ now: new Date(STARTS_AT.getTime() - 30 * 60_000) }),
    );
    expect(r.valid).toBe(true);
  });
});
