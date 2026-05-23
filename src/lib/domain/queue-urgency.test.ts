import { describe, expect, it } from "vitest";
import {
  categorizeQueueItem,
  compareByUrgency,
  URGENCY_TAG_CONFIG,
} from "./queue-urgency";

const NOW = new Date("2026-05-22T15:00:00Z").getTime();

describe("categorizeQueueItem", () => {
  it("escalates to urgent on an urgent unacknowledged observation", () => {
    const result = categorizeQueueItem(
      {
        kind: "visit",
        observations: [{ severity: "urgent", summary: "Hypertensive crisis" }],
      },
      NOW,
    );
    expect(result.urgency).toBe("urgent");
    expect(result.reason).toContain("Hypertensive crisis");
  });

  it("escalates to urgent on safety keywords in the reason", () => {
    const result = categorizeQueueItem(
      { kind: "visit", reason: "Patient reports chest pain since this morning" },
      NOW,
    );
    expect(result.urgency).toBe("urgent");
  });

  it("flags concern observation + lab as urgent", () => {
    const result = categorizeQueueItem(
      {
        kind: "lab",
        observations: [{ severity: "concern", summary: "K+ trending high" }],
        documents: [{ kind: "lab" }],
      },
      NOW,
    );
    expect(result.urgency).toBe("urgent");
    expect(result.reason).toMatch(/critical lab/i);
  });

  it("returns high for refill requests where the patient is traveling", () => {
    const result = categorizeQueueItem(
      { kind: "refill", reason: "Patient traveling next week, ran out of meds" },
      NOW,
    );
    expect(result.urgency).toBe("high");
  });

  it("bumps stale message items >24h old to high", () => {
    const result = categorizeQueueItem(
      {
        kind: "message",
        reason: "general checkin",
        createdAt: new Date(NOW - 30 * 60 * 60 * 1000),
      },
      NOW,
    );
    expect(result.urgency).toBe("high");
  });

  it("defaults a clean scheduled visit to routine", () => {
    const result = categorizeQueueItem(
      { kind: "visit", reason: "follow up" },
      NOW,
    );
    expect(result.urgency).toBe("routine");
  });

  it("treats lone messages with no signal as low", () => {
    const result = categorizeQueueItem(
      { kind: "message", reason: "thank you" },
      NOW,
    );
    expect(result.urgency).toBe("low");
  });

  it("never throws for AI-opt-out patients (deterministic path)", () => {
    const result = categorizeQueueItem(
      { kind: "visit", reason: "annual physical", patientDeclinedAi: true },
      NOW,
    );
    expect(result.urgency).toBeDefined();
    expect(URGENCY_TAG_CONFIG[result.urgency]).toBeDefined();
  });
});

describe("compareByUrgency", () => {
  it("orders most urgent first", () => {
    const items = [
      categorizeQueueItem({ kind: "message", reason: "hello" }, NOW),
      categorizeQueueItem(
        { kind: "visit", reason: "chest pain on exertion" },
        NOW,
      ),
      categorizeQueueItem(
        { kind: "refill", reason: "ran out, traveling tomorrow" },
        NOW,
      ),
    ];
    items.sort(compareByUrgency);
    expect(items[0].urgency).toBe("urgent");
    expect(items[1].urgency).toBe("high");
    expect(items[2].urgency).toBe("low");
  });
});
