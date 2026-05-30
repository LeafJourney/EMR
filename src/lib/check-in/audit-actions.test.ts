import { describe, expect, it } from "vitest";

import { CHECK_IN_AUDIT_ACTIONS } from "./audit-actions";

describe("CHECK_IN_AUDIT_ACTIONS", () => {
  it("are all namespaced under checkin.* and unique", () => {
    const values = Object.values(CHECK_IN_AUDIT_ACTIONS);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v).toMatch(/^checkin\./);
    expect(new Set(values).size).toBe(values.length);
  });

  it("cover generation, view, redeem, and failed-attempt", () => {
    expect(CHECK_IN_AUDIT_ACTIONS.QR_GENERATED).toBeDefined();
    expect(CHECK_IN_AUDIT_ACTIONS.QR_VIEWED).toBeDefined();
    expect(CHECK_IN_AUDIT_ACTIONS.QR_REDEEMED).toBeDefined();
    expect(CHECK_IN_AUDIT_ACTIONS.QR_REDEEM_FAILED).toBeDefined();
    expect(CHECK_IN_AUDIT_ACTIONS.INTAKE_SUBMITTED).toBeDefined();
  });
});
