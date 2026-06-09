import { describe, expect, it } from "vitest";
import { isThreadResolved, unreadInboundCount } from "./thread-state";

describe("isThreadResolved", () => {
  const lastMessageAt = new Date("2026-06-08T12:00:00.000Z");

  it("is false when never resolved", () => {
    expect(isThreadResolved(null, lastMessageAt)).toBe(false);
    expect(isThreadResolved(undefined, lastMessageAt)).toBe(false);
  });

  it("is true when resolved at/after the last message (resolve survives refresh)", () => {
    expect(isThreadResolved(new Date("2026-06-08T12:00:00.000Z"), lastMessageAt)).toBe(true);
    expect(isThreadResolved(new Date("2026-06-08T13:00:00.000Z"), lastMessageAt)).toBe(true);
  });

  it("re-opens when a newer patient reply lands after the resolve mark", () => {
    const resolvedAt = new Date("2026-06-08T11:00:00.000Z");
    const newerReply = new Date("2026-06-08T12:30:00.000Z");
    expect(isThreadResolved(resolvedAt, newerReply)).toBe(false);
  });
});

describe("unreadInboundCount", () => {
  const me = "user_clin";

  it("counts inbound patient messages that are not read", () => {
    const msgs = [
      { status: "sent", senderUserId: "user_patient", senderAgent: null },
      { status: "sent", senderUserId: null, senderAgent: null }, // patient (no user)
      { status: "read", senderUserId: "user_patient", senderAgent: null }, // read → excluded
    ];
    expect(unreadInboundCount(msgs, me)).toBe(2);
  });

  it("excludes the clinician's own messages and AI drafts", () => {
    const msgs = [
      { status: "sent", senderUserId: me, senderAgent: null }, // own → excluded
      { status: "sent", senderUserId: null, senderAgent: "correspondenceNurse:1" }, // agent → excluded
      { status: "sent", senderUserId: "user_patient", senderAgent: null }, // counts
    ];
    expect(unreadInboundCount(msgs, me)).toBe(1);
  });

  it("is zero once everything inbound is read", () => {
    const msgs = [
      { status: "read", senderUserId: "user_patient", senderAgent: null },
      { status: "read", senderUserId: null, senderAgent: null },
    ];
    expect(unreadInboundCount(msgs, me)).toBe(0);
  });
});
