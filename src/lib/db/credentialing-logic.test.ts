import { describe, expect, it } from "vitest";
import {
  classifyExpiration,
  collectCredentialAlerts,
  isRecredentialDue,
} from "./credentialing-logic";

const NOW = new Date("2026-06-06T00:00:00.000Z");
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("classifyExpiration (EMR-627)", () => {
  it("returns unknown for a missing date", () => {
    expect(classifyExpiration(null, NOW)).toEqual({ state: "unknown", daysUntil: null });
  });

  it("flags a past date as expired with negative days", () => {
    const c = classifyExpiration(daysFromNow(-3), NOW);
    expect(c.state).toBe("expired");
    expect(c.daysUntil).toBeLessThan(0);
  });

  it("flags a soon date as expiring_soon within the window", () => {
    expect(classifyExpiration(daysFromNow(30), NOW, 60).state).toBe("expiring_soon");
  });

  it("flags a far date as ok beyond the window", () => {
    expect(classifyExpiration(daysFromNow(120), NOW, 60).state).toBe("ok");
  });
});

describe("isRecredentialDue (EMR-627)", () => {
  it("is false with no date", () => {
    expect(isRecredentialDue(null, NOW)).toBe(false);
  });
  it("is true within the window", () => {
    expect(isRecredentialDue(daysFromNow(45), NOW, 90)).toBe(true);
  });
  it("is false beyond the window", () => {
    expect(isRecredentialDue(daysFromNow(200), NOW, 90)).toBe(false);
  });
});

describe("collectCredentialAlerts (EMR-627/629)", () => {
  it("returns no alerts for a fully-current profile", () => {
    const alerts = collectCredentialAlerts(
      {
        deaExpiresAt: daysFromNow(300),
        licenseExpiresAt: daysFromNow(300),
        nextRecredentialAt: daysFromNow(700),
      },
      NOW,
    );
    expect(alerts).toHaveLength(0);
  });

  it("alerts on each expired/expiring document and on recredential due", () => {
    const alerts = collectCredentialAlerts(
      {
        deaExpiresAt: daysFromNow(-1), // expired
        licenseExpiresAt: daysFromNow(20), // expiring_soon
        malpracticeExpiresAt: daysFromNow(400), // ok → no alert
        boardCertExpiresAt: null, // unknown → no alert
        nextRecredentialAt: daysFromNow(30), // due
      },
      NOW,
    );
    const byType = Object.fromEntries(alerts.map((a) => [a.type, a.state]));
    expect(byType.dea).toBe("expired");
    expect(byType.license).toBe("expiring_soon");
    expect(byType.recredential).toBe("due");
    expect(byType.malpractice).toBeUndefined();
    expect(byType.board_cert).toBeUndefined();
  });
});
