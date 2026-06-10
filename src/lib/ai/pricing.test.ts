import { describe, expect, it } from "vitest";
import {
  MICRO_CENTS_PER_USD,
  formatUsdFromMicroCents,
  microCentsToUsd,
  priceUsageMicroCents,
} from "./pricing";

describe("priceUsageMicroCents", () => {
  it("prices a known model from the byok catalog (blended rate)", () => {
    // Gemini 2.0 Flash is $0.0001 / 1k tokens. 2000 tokens → $0.0002 →
    // 0.0002 * 1e8 = 20_000 micro-cents.
    expect(priceUsageMicroCents("google/gemini-2.0-flash-001", 1500, 500)).toBe(
      20_000,
    );
  });

  it("prices a premium model proportionally higher", () => {
    // Claude Opus 4.7 is $0.018 / 1k. 10k tokens → $0.18 → 18_000_000 mc.
    expect(priceUsageMicroCents("anthropic/claude-opus-4-7", 6000, 4000)).toBe(
      18_000_000,
    );
  });

  it("returns 0 for a priced free/local model", () => {
    expect(priceUsageMicroCents("local/default", 5000, 5000)).toBe(0);
  });

  it("returns 0 when no tokens were used", () => {
    expect(priceUsageMicroCents("google/gemini-2.0-flash-001", 0, 0)).toBe(0);
  });

  it("returns null for an unknown model (never fabricates a price)", () => {
    expect(priceUsageMicroCents("some/unlisted-model", 1000, 1000)).toBeNull();
  });

  it("clamps negative token counts rather than crediting cost", () => {
    expect(priceUsageMicroCents("google/gemini-2.0-flash-001", -100, 0)).toBe(0);
  });
});

describe("microCentsToUsd", () => {
  it("converts micro-cents to USD", () => {
    expect(microCentsToUsd(MICRO_CENTS_PER_USD)).toBe(1);
    expect(microCentsToUsd(20_000)).toBeCloseTo(0.0002, 10);
  });

  it("treats null/undefined/zero as $0", () => {
    expect(microCentsToUsd(null)).toBe(0);
    expect(microCentsToUsd(undefined)).toBe(0);
    expect(microCentsToUsd(0)).toBe(0);
  });
});

describe("formatUsdFromMicroCents", () => {
  it("keeps four decimals for sub-cent spend so it never reads $0.00", () => {
    expect(formatUsdFromMicroCents(20_000)).toBe("$0.0002");
  });

  it("uses standard currency precision once spend crosses a cent", () => {
    expect(formatUsdFromMicroCents(18_000_000)).toBe("$0.18");
    expect(formatUsdFromMicroCents(MICRO_CENTS_PER_USD)).toBe("$1.00");
  });

  it("renders exactly $0.00 for no spend", () => {
    expect(formatUsdFromMicroCents(0)).toBe("$0.00");
  });
});
