// EMR-756 — cost guardrail decision tests (pure).

import { describe, it, expect } from "vitest";
import {
  decideGuardrailStatus,
  SOFT_CAP_PCT,
  HARD_CAP_PCT,
} from "./cost-guardrails";

describe("decideGuardrailStatus", () => {
  it("returns ok when usage is well below the soft cap", () => {
    const r = decideGuardrailStatus({
      usedTokensMTD: 100_000,
      includedMonthlyTokens: 1_000_000,
    });
    expect(r.status).toBe("ok");
    expect(r.utilization).toBeCloseTo(0.1);
  });

  it("returns approaching_token_cap at the soft cap threshold", () => {
    const r = decideGuardrailStatus({
      usedTokensMTD: SOFT_CAP_PCT * 1_000_000,
      includedMonthlyTokens: 1_000_000,
    });
    expect(r.status).toBe("approaching_token_cap");
  });

  it("returns throttled at the hard cap threshold", () => {
    const r = decideGuardrailStatus({
      usedTokensMTD: HARD_CAP_PCT * 1_000_000,
      includedMonthlyTokens: 1_000_000,
    });
    expect(r.status).toBe("throttled");
  });

  it("returns ok when no allowance is enforced", () => {
    const r = decideGuardrailStatus({
      usedTokensMTD: 10_000_000_000,
      includedMonthlyTokens: null,
    });
    expect(r.status).toBe("ok");
    expect(r.utilization).toBe(null);
  });

  it("returns ok when the allowance is zero / nonsensical", () => {
    const r = decideGuardrailStatus({
      usedTokensMTD: 5,
      includedMonthlyTokens: 0,
    });
    expect(r.status).toBe("ok");
  });
});
