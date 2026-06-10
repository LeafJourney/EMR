import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_SESSION_MS,
  IDLE_LIMITS_MS,
  IDLE_WARNING_MS,
  evaluateSession,
  idleLimitForRoles,
} from "./idle-timeouts";

const MIN = 60_000;
const SEC = 1_000;

describe("idle-timeouts", () => {
  it("clinician/operator/practice_owner get 20 minutes", () => {
    expect(IDLE_LIMITS_MS.clinician).toBe(20 * MIN);
    expect(IDLE_LIMITS_MS.operator).toBe(20 * MIN);
    expect(IDLE_LIMITS_MS.practice_owner).toBe(20 * MIN);
    expect(IDLE_LIMITS_MS.practice_admin).toBe(20 * MIN);
  });

  it("patient gets 30 minutes", () => {
    expect(IDLE_LIMITS_MS.patient).toBe(30 * MIN);
  });

  it("super_admin and implementation_admin get 20 minutes", () => {
    expect(IDLE_LIMITS_MS.super_admin).toBe(20 * MIN);
    expect(IDLE_LIMITS_MS.implementation_admin).toBe(20 * MIN);
  });

  it("kiosk keeps its tight 3-minute budget", () => {
    expect(IDLE_LIMITS_MS.kiosk).toBe(3 * MIN);
  });

  it("absolute cap is 12 hours", () => {
    expect(ABSOLUTE_SESSION_MS).toBe(12 * 60 * MIN);
  });

  it("warning window is 60 seconds", () => {
    expect(IDLE_WARNING_MS).toBe(60_000);
  });

  describe("idleLimitForRoles", () => {
    it("returns the role's limit for a single-role user", () => {
      expect(idleLimitForRoles(["patient"])).toBe(30 * MIN);
      expect(idleLimitForRoles(["clinician"])).toBe(20 * MIN);
      expect(idleLimitForRoles(["super_admin"])).toBe(20 * MIN);
    });

    it("picks the SHORTEST budget when a user has multiple roles", () => {
      // A super_admin who is also a patient should get the tighter 20-min
      // staff cap, not the 30-min patient one.
      expect(idleLimitForRoles(["patient", "super_admin"])).toBe(20 * MIN);
      expect(idleLimitForRoles(["clinician", "practice_owner"])).toBe(20 * MIN);
      expect(
        idleLimitForRoles(["patient", "clinician", "implementation_admin"]),
      ).toBe(20 * MIN);
      // The kiosk's 3-min budget still wins against any staff role.
      expect(idleLimitForRoles(["kiosk", "clinician"])).toBe(3 * MIN);
    });

    it("falls back to patient when roles are empty", () => {
      expect(idleLimitForRoles([])).toBe(30 * MIN);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // evaluateSession — exhaustive coverage of the timer-state decision tree
  // that drives the IdleTimeoutGuard modal. These cases replace what would
  // otherwise need a jsdom + fake-timers integration test for the React
  // component. The component is now a thin wrapper that calls evaluate()
  // each tick, so anything that's true here is true at runtime.
  // ─────────────────────────────────────────────────────────────────────────
  describe("evaluateSession", () => {
    // A clinician session at t=10:00:00 with no activity at all.
    const baseInput = {
      now: 10 * 60 * MIN,
      lastActivityAt: 10 * 60 * MIN,
      sessionStartedAt: 10 * 60 * MIN,
      idleLimitMs: 15 * MIN,
    };

    it('returns { kind: "ok" } when both clocks have lots of time', () => {
      expect(evaluateSession(baseInput)).toEqual({ kind: "ok" });
    });

    it('returns "ok" right up until the warning window opens', () => {
      // 61s before idle expires — still ok.
      const result = evaluateSession({
        ...baseInput,
        now: baseInput.lastActivityAt + 15 * MIN - 61 * SEC,
      });
      expect(result).toEqual({ kind: "ok" });
    });

    it('opens the idle warning at exactly the 60s mark', () => {
      // 60s before idle expires — warning should be up.
      const result = evaluateSession({
        ...baseInput,
        now: baseInput.lastActivityAt + 15 * MIN - 60 * SEC,
      });
      expect(result).toEqual({
        kind: "warn",
        reason: "idle",
        secondsLeft: 60,
      });
    });

    it("counts down smoothly inside the warning window", () => {
      // 17 seconds from sign-out → warning shows "17s".
      const result = evaluateSession({
        ...baseInput,
        now: baseInput.lastActivityAt + 15 * MIN - 17 * SEC,
      });
      expect(result).toEqual({
        kind: "warn",
        reason: "idle",
        secondsLeft: 17,
      });
    });

    it("never shows 0s — clamps to 1s at the bottom", () => {
      // 200ms left → display "1s" instead of "0s" so the UI doesn't lie.
      const result = evaluateSession({
        ...baseInput,
        now: baseInput.lastActivityAt + 15 * MIN - 200,
      });
      expect(result).toEqual({
        kind: "warn",
        reason: "idle",
        secondsLeft: 1,
      });
    });

    it("forces sign-out the moment idle hits zero", () => {
      // exactly at the limit — sign out immediately.
      expect(
        evaluateSession({
          ...baseInput,
          now: baseInput.lastActivityAt + 15 * MIN,
        }),
      ).toEqual({ kind: "force_signout", reason: "idle" });

      // and well past the limit.
      expect(
        evaluateSession({
          ...baseInput,
          now: baseInput.lastActivityAt + 20 * MIN,
        }),
      ).toEqual({ kind: "force_signout", reason: "idle" });
    });

    it("forces sign-out when the 12-hour absolute cap hits, even with constant activity", () => {
      const sessionStart = 0;
      const result = evaluateSession({
        now: sessionStart + 12 * 60 * MIN,
        lastActivityAt: sessionStart + 12 * 60 * MIN, // just clicked!
        sessionStartedAt: sessionStart,
        idleLimitMs: 15 * MIN,
      });
      expect(result).toEqual({ kind: "force_signout", reason: "session_max" });
    });

    it('shows the "session_max" warning when the absolute cap is the closer clock', () => {
      // 30s before the 12h cap, and the user is actively clicking — so
      // idle clock has lots of time left. Session_max should win the
      // reason field.
      const sessionStart = 0;
      const now = sessionStart + 12 * 60 * MIN - 30 * SEC;
      const result = evaluateSession({
        now,
        lastActivityAt: now, // active
        sessionStartedAt: sessionStart,
        idleLimitMs: 15 * MIN,
      });
      expect(result).toEqual({
        kind: "warn",
        reason: "session_max",
        secondsLeft: 30,
      });
    });

    it("tie-breaks to session_max when both clocks have identical remaining time", () => {
      // Constructed so idleRemaining === sessionRemaining === 45s.
      // Tie should resolve to "session_max" — the more accurate reason
      // since the absolute cap is fundamental and the idle clock just
      // happened to land at the same number.
      const idleLimitMs = 15 * MIN;
      const absoluteCapMs = 12 * 60 * MIN;
      const idleRemaining = 45 * SEC;
      const sessionRemaining = 45 * SEC;
      const sessionStart = 0;
      const now = absoluteCapMs - sessionRemaining;
      const lastActivityAt = now - (idleLimitMs - idleRemaining);
      const result = evaluateSession({
        now,
        lastActivityAt,
        sessionStartedAt: sessionStart,
        idleLimitMs,
        absoluteCapMs,
      });
      expect(result).toEqual({
        kind: "warn",
        reason: "session_max",
        secondsLeft: 45,
      });
    });

    it("uses the shorter clock's reason when they aren't tied", () => {
      // 5s left on idle, 5 minutes left on absolute cap → idle wins.
      const sessionStart = 0;
      const now = 30 * MIN; // 11.5h to go on absolute cap
      const lastActivityAt = now - (15 * MIN - 5 * SEC);
      expect(
        evaluateSession({
          now,
          lastActivityAt,
          sessionStartedAt: sessionStart,
          idleLimitMs: 15 * MIN,
        }),
      ).toEqual({ kind: "warn", reason: "idle", secondsLeft: 5 });
    });

    it("respects per-call overrides for absoluteCapMs and warningMs", () => {
      // Tighten the policy: 5-minute cap, 10-second warning window. Used
      // mostly for tests but also allows future per-deployment tuning
      // without touching the module-level constants.
      const sessionStart = 0;
      const now = 4 * MIN + 55 * SEC; // 5s until 5-min cap
      const result = evaluateSession({
        now,
        lastActivityAt: now,
        sessionStartedAt: sessionStart,
        idleLimitMs: 60 * MIN,
        absoluteCapMs: 5 * MIN,
        warningMs: 10 * SEC,
      });
      expect(result).toEqual({
        kind: "warn",
        reason: "session_max",
        secondsLeft: 5,
      });
    });

    it("defaults absoluteCapMs and warningMs to the module constants", () => {
      // Sanity check: omitting the overrides matches the documented
      // policy. 30s into a fresh session, no warning yet — proves we're
      // using the 12h cap, not some smaller test value.
      const sessionStart = 0;
      const result = evaluateSession({
        now: sessionStart + 30 * SEC,
        lastActivityAt: sessionStart + 30 * SEC,
        sessionStartedAt: sessionStart,
        idleLimitMs: 15 * MIN,
      });
      expect(result.kind).toBe("ok");
    });

    it("matches the module ABSOLUTE_SESSION_MS exactly at the cap boundary", () => {
      const sessionStart = 0;
      // One ms before the cap: still warning, not yet signed out.
      const justBefore = evaluateSession({
        now: sessionStart + ABSOLUTE_SESSION_MS - 1,
        lastActivityAt: sessionStart + ABSOLUTE_SESSION_MS - 1,
        sessionStartedAt: sessionStart,
        idleLimitMs: 15 * MIN,
      });
      expect(justBefore.kind).toBe("warn");
      expect(justBefore).toMatchObject({ reason: "session_max" });

      // At the cap: forced sign-out.
      const atCap = evaluateSession({
        now: sessionStart + ABSOLUTE_SESSION_MS,
        lastActivityAt: sessionStart + ABSOLUTE_SESSION_MS,
        sessionStartedAt: sessionStart,
        idleLimitMs: 15 * MIN,
      });
      expect(atCap).toEqual({ kind: "force_signout", reason: "session_max" });
    });

    it("matches the module IDLE_WARNING_MS exactly at the warning boundary", () => {
      // Activity exactly IDLE_WARNING_MS before idle expiry — must be
      // a warn, not an ok. The component relies on this so the modal
      // can't be hidden for the final minute.
      const result = evaluateSession({
        ...baseInput,
        now: baseInput.lastActivityAt + 15 * MIN - IDLE_WARNING_MS,
      });
      expect(result.kind).toBe("warn");
    });

    it("matrix: every per-role idle budget enters its warning window correctly", () => {
      // Loop the documented policy so a future tweak to IDLE_LIMITS_MS
      // can't silently break the warning behavior for one role.
      const cases: Array<[keyof typeof IDLE_LIMITS_MS, number]> = [
        ["patient", 30 * MIN],
        ["clinician", 20 * MIN],
        ["operator", 20 * MIN],
        ["practice_owner", 20 * MIN],
        ["super_admin", 20 * MIN],
        ["implementation_admin", 20 * MIN],
        ["kiosk", 3 * MIN],
      ];
      for (const [role, limit] of cases) {
        const idleLimitMs = IDLE_LIMITS_MS[role];
        expect(idleLimitMs).toBe(limit);
        // 30s before timeout → warning shows "30s".
        const result = evaluateSession({
          now: idleLimitMs,
          lastActivityAt: 30 * SEC,
          sessionStartedAt: 0,
          idleLimitMs,
        });
        expect(result).toEqual({
          kind: "warn",
          reason: "idle",
          secondsLeft: 30,
        });
      }
    });
  });
});
