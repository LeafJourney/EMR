import { describe, expect, it } from "vitest";
import {
  normalizeInboundMessage,
  stripMessagingArtifacts,
} from "../normalize";

describe("stripMessagingArtifacts", () => {
  it("removes zero-width characters and BOMs smuggled in by SMS clients", () => {
    expect(
      stripMessagingArtifacts("chest\u200Bpain\uFEFF now\u2060"),
    ).toBe("chestpain now");
  });

  it("removes control characters but keeps the patient's words intact", () => {
    expect(stripMessagingArtifacts("hi\u0007there\u0000 friend")).toBe(
      "hithere friend",
    );
  });

  it("collapses duplicate whitespace, newlines, and tabs", () => {
    expect(stripMessagingArtifacts("  I   can't\n\nbreathe\t\tat all  ")).toBe(
      "I can't breathe at all",
    );
  });

  it("converts curly quotes to straight quotes", () => {
    expect(stripMessagingArtifacts("I’m “fine”")).toBe(
      `I'm "fine"`,
    );
  });

  it("preserves case and punctuation (distress signal lives there)", () => {
    expect(stripMessagingArtifacts("HELP!!! Chest pain, NOW.")).toBe(
      "HELP!!! Chest pain, NOW.",
    );
  });

  it("tolerates null-ish input", () => {
    expect(stripMessagingArtifacts(undefined as unknown as string)).toBe("");
  });
});

describe("normalizeInboundMessage", () => {
  it("produces the channel-agnostic normalized shape", () => {
    const receivedAt = new Date("2026-06-12T08:00:00Z");
    const out = normalizeInboundMessage({
      patientId: "p1",
      channel: "sms",
      rawBody: "  Having  sob ​and my chest hurts  ",
      senderVerified: true,
      receivedAt,
      externalId: "SM123",
    });

    expect(out).toEqual({
      patientId: "p1",
      channel: "sms",
      receivedAt,
      rawBody: "Having sob and my chest hurts",
      // Lowercased + UPI abbreviation expansion ("sob" → "shortness of breath")
      normalizedBody: "having shortness of breath and my chest hurts",
      senderVerified: true,
      externalId: "SM123",
    });
  });

  it("reuses the UPI engine's abbreviation dictionary (no gateway copy)", () => {
    const out = normalizeInboundMessage({
      patientId: "p1",
      channel: "portal",
      rawBody: "need a new rx and an appt, also n/v since yesterday",
      senderVerified: true,
    });
    expect(out.normalizedBody).toBe(
      "need a new prescription and an appointment, also nausea and vomiting since yesterday",
    );
  });

  it("keeps the case-preserved body separate from the triage-normalized body", () => {
    const out = normalizeInboundMessage({
      patientId: null,
      channel: "sms",
      rawBody: "CANT BREATHE",
      senderVerified: false,
    });
    expect(out.rawBody).toBe("CANT BREATHE");
    expect(out.normalizedBody).toBe("can't breathe");
  });

  it("defaults receivedAt to now and externalId to null", () => {
    const before = Date.now();
    const out = normalizeInboundMessage({
      patientId: "p1",
      channel: "portal",
      rawBody: "hello",
      senderVerified: true,
    });
    expect(out.receivedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(out.externalId).toBeNull();
  });
});
