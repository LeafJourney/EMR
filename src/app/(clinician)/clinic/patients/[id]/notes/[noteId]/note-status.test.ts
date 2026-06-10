import { describe, expect, it } from "vitest";
import { noteStatusBadge } from "./note-status";

/**
 * WS-A items 2 & 3 — the status badge is the one place the editor and the page
 * header agree on a note's lifecycle. The behavioural contract that matters
 * most: a note routed for co-signature must NOT read as "signed".
 */
describe("noteStatusBadge", () => {
  it("labels a co-signature-pending note honestly (never 'signed')", () => {
    const badge = noteStatusBadge("pending_cosign");
    expect(badge.label).toBe("Awaiting co-signature");
    expect(badge.tone).toBe("warning");
    expect(badge.label.toLowerCase()).not.toContain("signed");
  });

  it("maps finalized → Signed (success)", () => {
    expect(noteStatusBadge("finalized")).toEqual({ label: "Signed", tone: "success" });
  });

  it("maps amended → Amended (info)", () => {
    expect(noteStatusBadge("amended")).toEqual({ label: "Amended", tone: "info" });
  });

  it("maps draft → Draft (neutral)", () => {
    expect(noteStatusBadge("draft")).toEqual({ label: "Draft", tone: "neutral" });
  });

  it("passes unknown statuses through as neutral (e.g. retired needs_review)", () => {
    expect(noteStatusBadge("needs_review")).toEqual({
      label: "needs_review",
      tone: "neutral",
    });
  });
});
