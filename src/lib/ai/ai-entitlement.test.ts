import { describe, expect, it } from "vitest";
import { decideEntitlement } from "./ai-entitlement";

describe("decideEntitlement", () => {
  it("entitles active and trialing subscriptions", () => {
    expect(decideEntitlement({ status: "active", throttled: false, requireSubscription: false }).entitled).toBe(true);
    expect(decideEntitlement({ status: "trialing", throttled: false, requireSubscription: false }).entitled).toBe(true);
  });

  it("blocks past_due / canceled / incomplete", () => {
    for (const status of ["past_due", "canceled", "incomplete"]) {
      const d = decideEntitlement({ status, throttled: false, requireSubscription: false });
      expect(d.entitled).toBe(false);
      expect(d.reason).toBe("inactive_status");
    }
  });

  it("blocks a throttled subscription even if active", () => {
    const d = decideEntitlement({ status: "active", throttled: true, requireSubscription: false });
    expect(d.entitled).toBe(false);
    expect(d.reason).toBe("throttled");
  });

  it("fails open by default when no subscription row exists", () => {
    const d = decideEntitlement({ status: null, throttled: false, requireSubscription: false });
    expect(d.entitled).toBe(true);
  });

  it("fails closed for no subscription when strict mode is on", () => {
    const d = decideEntitlement({ status: null, throttled: false, requireSubscription: true });
    expect(d.entitled).toBe(false);
    expect(d.reason).toBe("no_subscription");
  });
});
