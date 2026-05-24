// EMR-742 Phase 2 — unit tests for the impersonation cookie helpers.
//
// These tests exercise the pure sign/verify pair only. We deliberately
// do NOT touch `readImpersonationFromCookies` / `setImpersonationCookie`
// here — those wrap Next.js `cookies()` which throws outside a request
// scope and would require a heavy mock. The sign/verify functions are
// where every meaningful security property lives (HMAC, version prefix,
// bound user check, expiry check), so covering them covers the threat
// model the module is defending against.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  signImpersonationCookie,
  verifyImpersonationCookie,
  type ImpersonationSession,
} from "./impersonation";

const ORIGINAL_SECRET = process.env.SESSION_SECRET;

function freshSession(
  overrides: Partial<ImpersonationSession> = {},
): ImpersonationSession {
  const now = Date.now();
  return {
    impersonatorUserId: "user_super_admin_123",
    practiceOrgId: "org_practice_abc",
    practiceName: "Maple Wellness Clinic",
    startedAt: now,
    expiresAt: now + 30 * 60 * 1000,
    ...overrides,
  };
}

describe("impersonation cookie sign/verify", () => {
  beforeEach(() => {
    // Pin a known secret so tests are deterministic and independent of
    // whatever shell env they ran from.
    process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = ORIGINAL_SECRET;
    }
  });

  it("roundtrips a valid signature: signed cookie verifies and returns the same session", () => {
    const session = freshSession();
    const cookie = signImpersonationCookie(session);

    expect(cookie.startsWith("v1.")).toBe(true);
    expect(cookie.split(".")).toHaveLength(3);

    const verified = verifyImpersonationCookie(
      cookie,
      session.impersonatorUserId,
    );
    expect(verified).not.toBeNull();
    expect(verified).toEqual(session);
  });

  it("rejects a tampered signature", () => {
    const session = freshSession();
    const cookie = signImpersonationCookie(session);

    // Flip the last character of the hex signature. We pick a char we
    // know is different (a -> b, otherwise -> a) so the test is stable
    // regardless of which signature came out of the HMAC.
    const lastChar = cookie.slice(-1);
    const flipped = lastChar === "a" ? "b" : "a";
    const tampered = cookie.slice(0, -1) + flipped;
    expect(tampered).not.toBe(cookie);

    const verified = verifyImpersonationCookie(
      tampered,
      session.impersonatorUserId,
    );
    expect(verified).toBeNull();
  });

  it("rejects an expired payload (expiresAt in the past)", () => {
    const past = Date.now() - 60_000;
    const session = freshSession({
      startedAt: past - 30 * 60 * 1000,
      expiresAt: past,
    });
    const cookie = signImpersonationCookie(session);

    const verified = verifyImpersonationCookie(
      cookie,
      session.impersonatorUserId,
    );
    expect(verified).toBeNull();
  });

  it("rejects a cookie bound to a different user id (replay protection)", () => {
    const session = freshSession({ impersonatorUserId: "user_alice" });
    const cookie = signImpersonationCookie(session);

    const verified = verifyImpersonationCookie(cookie, "user_bob");
    expect(verified).toBeNull();

    // Sanity check: same cookie still verifies for the correct user.
    const verifiedForOwner = verifyImpersonationCookie(cookie, "user_alice");
    expect(verifiedForOwner).not.toBeNull();
  });

  it("rejects an undefined / empty raw cookie", () => {
    expect(verifyImpersonationCookie(undefined, "anyone")).toBeNull();
    expect(verifyImpersonationCookie("", "anyone")).toBeNull();
  });

  it("rejects a wrong-version prefix (forward compatibility guard)", () => {
    const session = freshSession();
    const cookie = signImpersonationCookie(session);
    // v1.<payload>.<sig> -> v2.<payload>.<sig>
    const wrongVersion = "v2" + cookie.slice(2);

    const verified = verifyImpersonationCookie(
      wrongVersion,
      session.impersonatorUserId,
    );
    expect(verified).toBeNull();
  });
});
