import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { describe, it, expect, beforeEach } from "vitest";
import { webhookHealthDetector } from "./webhook-health";

function fakePrismaWith(okCount: number, errorCount: number) {
  // The detector fires its two `count()` calls via `Promise.all` in a fixed
  // order: OK first, then error. We exploit that ordering for the mock.
  let call = 0;
  return {
    controllerAuditLog: {
      count: vi.fn().mockImplementation(() => {
        call += 1;
        return Promise.resolve(call === 1 ? okCount : errorCount);
      }),
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-17T12:00:00Z"));
});

describe("webhookHealthDetector — EMR-740", () => {
  it("has stable slug webhook_health", () => {
    expect(webhookHealthDetector.slug).toBe("webhook_health");
  });

  it("emits nothing when zero webhook traffic", async () => {
    const out = await webhookHealthDetector.run(fakePrismaWith(0, 0) as never);
    expect(out).toEqual([]);
  });

  it("emits nothing when success rate is healthy (>=95%)", async () => {
    const out = await webhookHealthDetector.run(fakePrismaWith(99, 1) as never);
    expect(out).toEqual([]);
  });

  it("emits WARNING when success rate is 80-95%", async () => {
    const out = await webhookHealthDetector.run(fakePrismaWith(90, 10) as never);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("warning");
    expect(out[0].practiceId).toBeNull();
    expect(out[0].idempotencyKey).toBe("webhook_health:2026-05-17T12");
  });

  it("emits CRITICAL when success rate dips below 80%", async () => {
    const out = await webhookHealthDetector.run(fakePrismaWith(50, 50) as never);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("critical");
  });

  it("keys idempotency by hour bucket — same hour collapses", async () => {
    const first = await webhookHealthDetector.run(fakePrismaWith(70, 30) as never);
    const second = await webhookHealthDetector.run(fakePrismaWith(70, 30) as never);
    expect(first[0].idempotencyKey).toBe(second[0].idempotencyKey);
  });
});
